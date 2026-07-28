import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkInDaycareSession,
  resolveCutoffInstant,
} from './daycareCheckIn.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { startBooking } from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  startBooking: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedWrite {
  table: string;
  method: string;
  payload?: unknown;
}

const recordedWrites: RecordedWrite[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.insert = vi.fn((payload?: unknown) => {
      recordedWrites.push({ table, method: 'insert', payload });
      return builder;
    });

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));

    return builder;
  }) as never);
}

const MAKATI_BRANCH = {
  name: 'Makati',
  timezone: 'Asia/Manila',
  daycare_checkin_cutoff: '16:00:00',
};

const SOUTHWOODS_BRANCH = {
  name: 'Southwoods',
  timezone: 'Asia/Manila',
  daycare_checkin_cutoff: '18:00:00',
};

describe('daycareCheckIn.service (#65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.useRealTimers();
  });

  describe('resolveCutoffInstant', () => {
    it('resolves a HH:MM:SS branch-local cutoff to the equivalent UTC instant', () => {
      const now = new Date('2026-07-19T01:00:00.000Z'); // 09:00 Asia/Manila
      const cutoff = resolveCutoffInstant('Asia/Manila', '16:00:00', now);
      // 16:00 Asia/Manila (UTC+8) == 08:00 UTC same calendar day.
      expect(cutoff.toISOString()).toBe('2026-07-19T08:00:00.000Z');
    });
  });

  describe('checkInDaycareSession', () => {
    it('AC-1: an existing Pending Daycare booking succeeds and starts the booking', async () => {
      const beforeCutoff = new Date('2026-07-19T01:00:00.000Z'); // 09:00 Asia/Manila
      vi.useFakeTimers();
      vi.setSystemTime(beforeCutoff);

      queueFromResults(
        {
          data: {
            id: 'booking-1',
            pet_id: 'pet-1',
            branch_id: 'branch-makati',
            service_category: 'Daycare',
            status: 'Pending',
          },
          error: null,
        },
        { data: MAKATI_BRANCH, error: null },
        {
          data: { id: 'session-1', booking_id: 'booking-1', status: 'Active' },
          error: null,
        }
      );

      const result = await checkInDaycareSession({
        requesterId: 'staff-1',
        input: { booking_id: 'booking-1' },
      });

      expect(result.status).toBe('Active');
      const insert = recordedWrites.find((write) => write.method === 'insert');
      expect(insert?.payload).toMatchObject({
        booking_id: 'booking-1',
        pet_id: 'pet-1',
        branch_id: 'branch-makati',
      });
      expect(startBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });

      vi.useRealTimers();
    });

    it('rejects check-in for a booking that is not Pending', async () => {
      queueFromResults({
        data: {
          id: 'booking-1',
          pet_id: 'pet-1',
          branch_id: 'branch-makati',
          service_category: 'Daycare',
          status: 'In Progress',
        },
        error: null,
      });

      await expect(
        checkInDaycareSession({
          requesterId: 'staff-1',
          input: { booking_id: 'booking-1' },
        })
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(startBooking).not.toHaveBeenCalled();
    });

    it('AC-1: a fresh walk-in with no booking succeeds', async () => {
      const beforeCutoff = new Date('2026-07-19T01:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(beforeCutoff);

      queueFromResults(
        { data: MAKATI_BRANCH, error: null },
        {
          data: { id: 'session-2', booking_id: null, status: 'Active' },
          error: null,
        }
      );

      const result = await checkInDaycareSession({
        requesterId: 'staff-1',
        input: { pet_id: 'pet-2', branch_id: 'branch-makati' },
      });

      expect(result.status).toBe('Active');
      const insert = recordedWrites.find((write) => write.method === 'insert');
      expect(insert?.payload).toMatchObject({
        booking_id: null,
        pet_id: 'pet-2',
      });
      // Walk-ins have no booking_id, so there's nothing to sync.
      expect(startBooking).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('AC-2: check-in after the Makati 4:00 PM cutoff is rejected and creates no row', async () => {
      const afterCutoff = new Date('2026-07-19T09:00:00.000Z'); // 17:00 Asia/Manila
      vi.useFakeTimers();
      vi.setSystemTime(afterCutoff);

      queueFromResults({ data: MAKATI_BRANCH, error: null });

      await expect(
        checkInDaycareSession({
          requesterId: 'staff-1',
          input: { pet_id: 'pet-2', branch_id: 'branch-makati' },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Check-in unavailable after'),
      });

      expect(recordedWrites).toHaveLength(0);

      vi.useRealTimers();
    });

    it('AC-2: Southwoods reads its own branch-config cutoff column, distinct from Makati', async () => {
      const time = new Date('2026-07-19T09:30:00.000Z'); // 17:30 Asia/Manila
      vi.useFakeTimers();
      vi.setSystemTime(time);

      queueFromResults(
        { data: SOUTHWOODS_BRANCH, error: null },
        {
          data: { id: 'session-3', booking_id: null, status: 'Active' },
          error: null,
        }
      );

      const result = await checkInDaycareSession({
        requesterId: 'staff-1',
        input: { pet_id: 'pet-3', branch_id: 'branch-southwoods' },
      });

      expect(result.status).toBe('Active');

      vi.useRealTimers();
    });

    it('rejects check-in for a non-Daycare booking', async () => {
      queueFromResults({
        data: {
          id: 'booking-1',
          pet_id: 'pet-1',
          branch_id: 'branch-makati',
          service_category: 'Grooming',
          status: 'Pending',
        },
        error: null,
      });

      await expect(
        checkInDaycareSession({
          requesterId: 'staff-1',
          input: { booking_id: 'booking-1' },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
