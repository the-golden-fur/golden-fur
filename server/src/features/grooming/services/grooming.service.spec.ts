import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listGroomingQueue, transitionGroomingSessionStatus } from './grooming.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  completeBooking,
  startBooking,
} from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  startBooking: vi.fn(),
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

    for (const method of ['select', 'eq', 'in', 'gte', 'lt']) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update']) {
      builder[method] = vi.fn((payload?: unknown) => {
        recordedWrites.push({ table, method, payload });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const GROOMER_ID = 'groomer-1';
const OTHER_GROOMER_ID = 'groomer-2';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    booking_id: 'booking-1',
    assigned_groomer_id: GROOMER_ID,
    queue_position: null,
    ...overrides,
  };
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    status: 'Pending',
    ...overrides,
  };
}

describe('grooming.service (#64, booking-status revision)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('transitionGroomingSessionStatus', () => {
    it('AC-1: the assigned groomer can move a session to In Progress, delegating to startBooking', async () => {
      queueFromResults(
        { data: sessionRow(), error: null }, // load session
        {
          data: {
            ...sessionRow(),
            booking: bookingRow({ status: 'In Progress' }),
          },
          error: null,
        } // refetch
      );
      vi.mocked(startBooking).mockResolvedValue(
        bookingRow({ status: 'In Progress' }) as never
      );

      const result = await transitionGroomingSessionStatus({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        sessionId: 'session-1',
        targetStatus: 'In Progress',
      });

      expect(startBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });
      expect(completeBooking).not.toHaveBeenCalled();
      expect(result.booking?.status).toBe('In Progress');
    });

    it('AC-1/AC-2: moving to Completed delegates to completeBooking', async () => {
      queueFromResults(
        { data: sessionRow(), error: null },
        {
          data: {
            ...sessionRow(),
            booking: bookingRow({ status: 'Completed' }),
          },
          error: null,
        }
      );
      vi.mocked(completeBooking).mockResolvedValue(
        bookingRow({ status: 'Completed' }) as never
      );

      const result = await transitionGroomingSessionStatus({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        sessionId: 'session-1',
        targetStatus: 'Completed',
      });

      expect(completeBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });
      expect(startBooking).not.toHaveBeenCalled();
      expect(result.booking?.status).toBe('Completed');
    });

    it('AC-1: an invalid transition rejected by the shared booking service propagates its 409', async () => {
      queueFromResults({ data: sessionRow(), error: null });
      vi.mocked(completeBooking).mockRejectedValue(
        Object.assign(new Error('A Pending booking cannot be completed'), {
          statusCode: 409,
        })
      );

      await expect(
        transitionGroomingSessionStatus({
          requesterId: GROOMER_ID,
          requesterRole: 'Groomer',
          sessionId: 'session-1',
          targetStatus: 'Completed',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("AC-3: a different groomer cannot transition someone else's session", async () => {
      queueFromResults({ data: sessionRow(), error: null });

      await expect(
        transitionGroomingSessionStatus({
          requesterId: OTHER_GROOMER_ID,
          requesterRole: 'Groomer',
          sessionId: 'session-1',
          targetStatus: 'In Progress',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(startBooking).not.toHaveBeenCalled();
    });

    it('AC-3: Admin/Supervisor/Superadmin can transition any session', async () => {
      queueFromResults(
        { data: sessionRow(), error: null },
        {
          data: {
            ...sessionRow(),
            booking: bookingRow({ status: 'In Progress' }),
          },
          error: null,
        }
      );
      vi.mocked(startBooking).mockResolvedValue(
        bookingRow({ status: 'In Progress' }) as never
      );

      const result = await transitionGroomingSessionStatus({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        sessionId: 'session-1',
        targetStatus: 'In Progress',
      });

      expect(result.booking?.status).toBe('In Progress');
    });

    it('returns a 404 when the session does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        transitionGroomingSessionStatus({
          requesterId: GROOMER_ID,
          requesterRole: 'Groomer',
          sessionId: 'session-missing',
          targetStatus: 'In Progress',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listGroomingQueue', () => {
    it('auto-creates a grooming_sessions row for a Pending/In Progress booking without one yet', async () => {
      queueFromResults(
        {
          data: [{ id: 'booking-1', assigned_staff_id: GROOMER_ID }],
          error: null,
        }, // bookings
        { data: [], error: null }, // existing sessions
        { data: null, error: null }, // insert
        {
          data: [
            {
              ...sessionRow(),
              booking: { scheduled_start: '2026-07-19T02:00:00.000Z' },
            },
          ],
          error: null,
        } // sessions select
      );

      const result = await listGroomingQueue({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        requesterBranchId: 'branch-1',
      });

      expect(result).toHaveLength(1);
      const insert = recordedWrites.find(
        (write) =>
          write.table === 'grooming_sessions' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject([
        {
          booking_id: 'booking-1',
          assigned_groomer_id: GROOMER_ID,
        },
      ]);
      // The dropped `status` column must never be written.
      expect(
        (insert?.payload as Array<Record<string, unknown>>)[0]
      ).not.toHaveProperty('status');
    });

    it('queries bookings with status IN (Pending, In Progress) - no more separate Confirmed/Pending split', async () => {
      const inSpy = vi.fn();

      vi.mocked(supabase.from).mockImplementation(((table: string) => {
        const builder: Record<string, unknown> = {};

        for (const method of ['select', 'eq', 'gte', 'lt']) {
          builder[method] = vi.fn(() => builder);
        }

        builder.in = vi.fn((column: string, values: unknown) => {
          if (table === 'bookings') inSpy(column, values);
          return builder;
        });

        for (const method of ['insert', 'update']) {
          builder[method] = vi.fn((payload?: unknown) => {
            recordedWrites.push({ table, method, payload });
            return builder;
          });
        }

        builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        builder.then = (resolve: (_result: QueryResult) => void) =>
          resolve({ data: [], error: null });

        return builder;
      }) as never);

      await listGroomingQueue({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        requesterBranchId: 'branch-1',
      });

      expect(inSpy).toHaveBeenCalledWith('status', ['Pending', 'In Progress']);
    });

    it('sorts by queue_position when set, otherwise scheduled_start', async () => {
      queueFromResults(
        {
          data: [
            { id: 'booking-1', assigned_staff_id: GROOMER_ID },
            { id: 'booking-2', assigned_staff_id: GROOMER_ID },
          ],
          error: null,
        },
        {
          data: [{ booking_id: 'booking-1' }, { booking_id: 'booking-2' }],
          error: null,
        }, // both already exist, no insert
        {
          data: [
            {
              ...sessionRow({ id: 'session-early', booking_id: 'booking-2' }),
              queue_position: null,
              booking: { scheduled_start: '2026-07-19T01:00:00.000Z' },
            },
            {
              ...sessionRow({ id: 'session-late', booking_id: 'booking-1' }),
              queue_position: null,
              booking: { scheduled_start: '2026-07-19T05:00:00.000Z' },
            },
          ],
          error: null,
        }
      );

      const result = await listGroomingQueue({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        requesterBranchId: 'branch-1',
      });

      expect(result.map((session) => session.id)).toEqual([
        'session-early',
        'session-late',
      ]);
    });
  });
});
