import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listActivityLog,
  recordActivity,
  recordBulkActivity,
} from './activityLog.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedInsert {
  table: string;
  payload: unknown;
}

const recordedInserts: RecordedInsert[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'gte', 'lt', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.insert = vi.fn((payload?: unknown) => {
      recordedInserts.push({ table, payload });
      return builder;
    });

    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const consoleErrorSpy = vi
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

describe('activityLog.service (custom change: Hotel/Daycare activity logbook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedInserts.length = 0;
  });

  describe('recordActivity', () => {
    it('inserts a row with the given fields, defaulting stay/care-log-entry/actor to null', async () => {
      queueFromResults({ data: null, error: null });

      await recordActivity({
        branchId: 'branch-1',
        action: 'check_in',
        description: 'Checked in for a Hotel stay',
      });

      expect(recordedInserts).toHaveLength(1);
      expect(recordedInserts[0]!.table).toBe('activity_log');
      expect(recordedInserts[0]!.payload).toMatchObject({
        branch_id: 'branch-1',
        stay_id: null,
        care_log_entry_id: null,
        action: 'check_in',
        actor_staff_id: null,
        description: 'Checked in for a Hotel stay',
      });
    });

    it('passes through stayId/careLogEntryId/actorStaffId when given', async () => {
      queueFromResults({ data: null, error: null });

      await recordActivity({
        branchId: 'branch-1',
        stayId: 'stay-1',
        careLogEntryId: 'entry-1',
        actorStaffId: 'staff-1',
        action: 'task_completed',
        description: 'Completed: Morning meal',
      });

      expect(recordedInserts[0]!.payload).toMatchObject({
        stay_id: 'stay-1',
        care_log_entry_id: 'entry-1',
        actor_staff_id: 'staff-1',
      });
    });

    it('is best-effort - a write failure is logged, not thrown, so it never breaks the caller', async () => {
      queueFromResults({ data: null, error: { message: 'insert failed' } });

      await expect(
        recordActivity({
          branchId: 'branch-1',
          action: 'check_in',
          description: 'Checked in for a Hotel stay',
        })
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('recordBulkActivity', () => {
    it('inserts one row per entry in a single batched call', async () => {
      queueFromResults({ data: null, error: null });

      await recordBulkActivity([
        {
          branchId: 'branch-1',
          stayId: 'stay-1',
          careLogEntryId: 'entry-1',
          action: 'task_missed',
          description: 'Missed: Morning meal',
        },
        {
          branchId: 'branch-1',
          stayId: 'stay-1',
          careLogEntryId: 'entry-2',
          action: 'task_missed',
          description: 'Missed: Morning walk',
        },
      ]);

      expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(1);
      expect(recordedInserts).toHaveLength(1);
      expect(recordedInserts[0]!.payload).toHaveLength(2);
      expect(
        (recordedInserts[0]!.payload as Array<{ actor_staff_id: null }>)[0]!
          .actor_staff_id
      ).toBeNull();
    });

    it('does nothing (no Supabase call at all) for an empty array', async () => {
      await recordBulkActivity([]);

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('is best-effort - a write failure is logged, not thrown', async () => {
      queueFromResults({ data: null, error: { message: 'insert failed' } });

      await expect(
        recordBulkActivity([
          {
            branchId: 'branch-1',
            action: 'task_missed',
            description: 'Missed: Morning meal',
          },
        ])
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('listActivityLog', () => {
    it('returns rows for the given branch, newest first (server-side order/limit applied via the query)', async () => {
      queueFromResults({
        data: [{ id: 'log-1' }, { id: 'log-2' }],
        error: null,
      });

      const entries = await listActivityLog({ branchId: 'branch-1' });

      expect(entries).toHaveLength(2);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(
        listActivityLog({ branchId: 'branch-1' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
