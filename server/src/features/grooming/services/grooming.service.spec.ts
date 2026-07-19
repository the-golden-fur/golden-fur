import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listGroomingQueue,
  transitionGroomingSessionStatus,
} from './grooming.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
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
    status: 'Waiting',
    queue_position: null,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

describe('grooming.service (#64)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('transitionGroomingSessionStatus', () => {
    it('AC-1: the assigned groomer can move Waiting -> In Progress, setting started_at', async () => {
      queueFromResults(
        { data: sessionRow(), error: null },
        { data: sessionRow({ status: 'In Progress' }), error: null }
      );

      const result = await transitionGroomingSessionStatus({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        sessionId: 'session-1',
        targetStatus: 'In Progress',
      });

      expect(result.status).toBe('In Progress');

      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ status: 'In Progress' });
      expect(
        (update?.payload as { started_at?: string }).started_at
      ).toBeTruthy();
    });

    it('AC-1/AC-2: In Progress -> Completed sets completed_at and marks the booking Completed', async () => {
      queueFromResults(
        { data: sessionRow({ status: 'In Progress' }), error: null },
        { data: sessionRow({ status: 'Completed' }), error: null },
        { data: null, error: null } // bookings update
      );

      const result = await transitionGroomingSessionStatus({
        requesterId: GROOMER_ID,
        requesterRole: 'Groomer',
        sessionId: 'session-1',
        targetStatus: 'Completed',
      });

      expect(result.status).toBe('Completed');

      const sessionUpdate = recordedWrites.find(
        (write) =>
          write.table === 'grooming_sessions' && write.method === 'update'
      );
      expect(
        (sessionUpdate?.payload as { completed_at?: string }).completed_at
      ).toBeTruthy();

      const bookingUpdate = recordedWrites.find(
        (write) => write.table === 'bookings'
      );
      expect(bookingUpdate?.payload).toMatchObject({ status: 'Completed' });
    });

    it('AC-1: skipping a state (Waiting -> Completed) is rejected', async () => {
      queueFromResults({
        data: sessionRow({ status: 'Waiting' }),
        error: null,
      });

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
    });

    it('AC-3: Admin/Supervisor/Superadmin can transition any session', async () => {
      queueFromResults(
        { data: sessionRow(), error: null },
        { data: sessionRow({ status: 'In Progress' }), error: null }
      );

      const result = await transitionGroomingSessionStatus({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        sessionId: 'session-1',
        targetStatus: 'In Progress',
      });

      expect(result.status).toBe('In Progress');
    });

    it('AC-4: transitioning an already-Completed session is rejected with a clear error', async () => {
      queueFromResults({
        data: sessionRow({ status: 'Completed' }),
        error: null,
      });

      await expect(
        transitionGroomingSessionStatus({
          requesterId: GROOMER_ID,
          requesterRole: 'Groomer',
          sessionId: 'session-1',
          targetStatus: 'Completed',
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already finalized'),
      });
    });
  });

  describe('listGroomingQueue', () => {
    it('auto-creates a Waiting session for a confirmed booking without one yet', async () => {
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
          status: 'Waiting',
        },
      ]);
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
