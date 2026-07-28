import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkOutDaycareSession,
  computeDaycareCharge,
} from './daycareBilling.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  completeBooking: vi.fn(),
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

    builder.update = vi.fn((payload?: unknown) => {
      recordedWrites.push({ table, method: 'update', payload });
      return builder;
    });

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));

    return builder;
  }) as never);
}

function minutesLater(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60000);
}

describe('daycareBilling.service (#65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('computeDaycareCharge', () => {
    it('AC-3: exactly 1 hour or less is a flat ₱100', () => {
      const start = new Date('2026-07-19T08:00:00Z');
      expect(computeDaycareCharge(start, minutesLater(start, 30))).toBe(100);
      expect(computeDaycareCharge(start, minutesLater(start, 60))).toBe(100);
    });

    it('rounds a partial succeeding hour up to a full billable hour (1h10m = ₱150)', () => {
      const start = new Date('2026-07-19T08:00:00Z');
      expect(computeDaycareCharge(start, minutesLater(start, 70))).toBe(150);
    });

    it('2 hours flat is ₱150 (1 succeeding hour, no partial)', () => {
      const start = new Date('2026-07-19T08:00:00Z');
      expect(computeDaycareCharge(start, minutesLater(start, 120))).toBe(150);
    });

    it("2h15m is ₱200 under the formula (see reviewer note in daycareBilling.service.ts - the Guide's AC-4 table claims ₱250, which is inconsistent with its own 1h10m worked example)", () => {
      const start = new Date('2026-07-19T08:00:00Z');
      expect(computeDaycareCharge(start, minutesLater(start, 135))).toBe(200);
    });
  });

  describe('checkOutDaycareSession', () => {
    it('AC-5: sets status Completed and computed_charge together', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: null,
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        {
          data: {
            id: 'session-1',
            booking_id: null,
            status: 'Completed',
            computed_charge: 100,
          },
          error: null,
        }
      );

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(result.status).toBe('Completed');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ status: 'Completed' });
      expect(
        (update?.payload as { computed_charge?: number }).computed_charge
      ).not.toBeNull();
      // Walk-ins have no booking_id, so there's nothing to sync.
      expect(completeBooking).not.toHaveBeenCalled();
    });

    it('a booking-linked session completes the linked booking on checkout', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
            computed_charge: 100,
          },
          error: null,
        }
      );

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(result.status).toBe('Completed');
      expect(completeBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });
    });

    it('does not let a 409 from a stale/cancelled linked booking block checkout', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
            computed_charge: 100,
          },
          error: null,
        }
      );

      const conflict = new Error('A Cancelled booking cannot be completed');
      (conflict as Error & { statusCode?: number }).statusCode = 409;
      vi.mocked(completeBooking).mockRejectedValueOnce(conflict);

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(result.status).toBe('Completed');
      expect(completeBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });
    });

    it('refuses to check out an already-Completed session', async () => {
      queueFromResults({
        data: {
          id: 'session-1',
          status: 'Completed',
          check_in_at: '2026-07-19T08:00:00.000Z',
        },
        error: null,
      });

      await expect(
        checkOutDaycareSession({ sessionId: 'session-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
