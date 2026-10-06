import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listGroomingQueue,
  transitionGroomingSessionStatus,
} from './grooming.service.ts';
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

    for (const method of ['select', 'eq', 'in', 'gte', 'lt', 'or']) {
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
    it('auto-creates a grooming_sessions row for an In Progress booking without one yet', async () => {
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

    it("includes a paid Pending booking - the groomer sees what's booked with them before the customer arrives", async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'booking-1',
              assigned_staff_id: GROOMER_ID,
              status: 'Pending',
              payment_status: 'Fully Paid',
            },
          ],
          error: null,
        }, // bookings
        { data: [], error: null }, // existing sessions
        { data: null, error: null }, // insert
        {
          data: [
            {
              ...sessionRow(),
              booking: bookingRow({
                scheduled_start: '2026-07-19T02:00:00.000Z',
              }),
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
      // ...and gets its session row like any other queue entry.
      expect(
        recordedWrites.some(
          (write) =>
            write.table === 'grooming_sessions' && write.method === 'insert'
        )
      ).toBe(true);
    });

    it('leaves out a Pending booking that has not been paid for - not a secured appointment yet', async () => {
      queueFromResults({
        data: [
          {
            id: 'booking-1',
            assigned_staff_id: GROOMER_ID,
            status: 'Pending',
            payment_status: 'Pending',
          },
        ],
        error: null,
      });

      const result = await listGroomingQueue({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        requesterBranchId: 'branch-1',
      });

      expect(result).toEqual([]);
      // No session row is created for it either.
      expect(recordedWrites).toHaveLength(0);
    });

    it('asks for Pending and In Progress bookings, still scoped to the requesting groomer', async () => {
      const inSpy = vi.fn();
      const eqSpy = vi.fn();

      vi.mocked(supabase.from).mockImplementation(((table: string) => {
        const builder: Record<string, unknown> = {};

        for (const method of ['select', 'gte', 'lt', 'or']) {
          builder[method] = vi.fn(() => builder);
        }

        builder.in = vi.fn((column: string, values: unknown) => {
          if (table === 'bookings') inSpy(column, values);
          return builder;
        });
        builder.eq = vi.fn((column: string, value: unknown) => {
          if (table === 'bookings') eqSpy(column, value);
          return builder;
        });

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
      expect(eqSpy).toHaveBeenCalledWith('assigned_staff_id', GROOMER_ID);
    });

    describe('history view', () => {
      it('lists Completed bookings, newest completion first, without the unpaid-downpayment filter', async () => {
        const inSpy = vi.fn();
        const orSpy = vi.fn();
        const results: QueryResult[] = [
          {
            data: [
              {
                id: 'booking-1',
                assigned_staff_id: GROOMER_ID,
                status: 'Completed',
                payment_status: 'Pending',
              },
              {
                id: 'booking-2',
                assigned_staff_id: GROOMER_ID,
                status: 'Completed',
                payment_status: 'Fully Paid',
              },
            ],
            error: null,
          }, // bookings
          {
            data: [{ booking_id: 'booking-1' }, { booking_id: 'booking-2' }],
            error: null,
          }, // existing sessions - nothing to create
          {
            data: [
              {
                ...sessionRow({ id: 'session-1', booking_id: 'booking-1' }),
                booking: { completed_at: '2026-07-19T03:00:00.000Z' },
              },
              {
                ...sessionRow({ id: 'session-2', booking_id: 'booking-2' }),
                booking: { completed_at: '2026-07-19T09:00:00.000Z' },
              },
            ],
            error: null,
          }, // sessions select
        ];

        vi.mocked(supabase.from).mockImplementation(((table: string) => {
          const result = results.shift() ?? { data: null, error: null };
          const builder: Record<string, unknown> = {};

          for (const method of ['select', 'eq', 'gte', 'lt']) {
            builder[method] = vi.fn(() => builder);
          }
          builder.in = vi.fn((column: string, values: unknown) => {
            if (table === 'bookings') inSpy(column, values);
            return builder;
          });
          builder.or = vi.fn((filter: string) => {
            orSpy(filter);
            return builder;
          });
          builder.then = (resolve: (_result: QueryResult) => void) =>
            resolve(result);

          return builder;
        }) as never);

        const result = await listGroomingQueue({
          requesterId: GROOMER_ID,
          requesterRole: 'Groomer',
          requesterBranchId: 'branch-1',
          view: 'history',
        });

        expect(inSpy).toHaveBeenCalledWith('status', ['Completed']);
        expect(orSpy).not.toHaveBeenCalled();
        // The unpaid Completed booking is still part of the record.
        expect(result.map((session) => session.id)).toEqual([
          'session-2',
          'session-1',
        ]);
      });
    });

    describe('date range', () => {
      function captureDateBounds() {
        const bounds: Record<string, unknown> = {};

        vi.mocked(supabase.from).mockImplementation((() => {
          const builder: Record<string, unknown> = {};

          for (const method of ['select', 'eq', 'in', 'or']) {
            builder[method] = vi.fn(() => builder);
          }
          builder.gte = vi.fn((_column: string, value: unknown) => {
            bounds.from = value;
            return builder;
          });
          builder.lt = vi.fn((_column: string, value: unknown) => {
            bounds.to = value;
            return builder;
          });
          builder.then = (resolve: (_result: QueryResult) => void) =>
            resolve({ data: [], error: null });

          return builder;
        }) as never);

        return bounds;
      }

      const REQUESTER = {
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        requesterBranchId: 'branch-1',
      };

      it('"All dates" covers every date, upcoming ones included - not just today', async () => {
        const bounds = captureDateBounds();

        await listGroomingQueue({ ...REQUESTER, allDates: true });

        expect(bounds.from).toBe('1970-01-01T00:00:00.000Z');
        expect(bounds.to).toBe('9999-12-31T00:00:00.000Z');
      });

      it('still defaults to today when no range is asked for at all', async () => {
        const bounds = captureDateBounds();

        await listGroomingQueue(REQUESTER);

        const dayMs = 24 * 60 * 60 * 1000;
        expect(
          new Date(bounds.to as string).getTime() -
            new Date(bounds.from as string).getTime()
        ).toBe(dayMs);
      });

      it('an explicit range wins over allDates', async () => {
        const bounds = captureDateBounds();

        await listGroomingQueue({
          ...REQUESTER,
          dateFrom: '2026-10-02',
          dateTo: '2026-10-02',
          allDates: true,
        });

        expect(bounds.from).toBe('2026-10-02T00:00:00.000Z');
        expect(bounds.to).toBe('2026-10-03T00:00:00.000Z');
      });
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
