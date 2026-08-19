import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertChecklistComplete,
  completeCareLogEntry,
  getCareLogEntries,
  reopenCareLogEntry,
  startCareLogEntry,
} from './careLogCompletion.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendCareLogCompletedNotification } from './careLogNotifications.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

// Issue #99: care_log_completed dispatch is covered by its own unit tests
// (careLogNotifications.service.spec.ts) - mocked wholesale here so these
// pre-existing completion tests don't need to account for its extra
// Supabase lookups in their sequential mock queue below.
vi.mock('./careLogNotifications.service.ts', () => ({
  sendCareLogCompletedNotification: vi.fn().mockResolvedValue(undefined),
}));

// Custom change (activity logbook): same reasoning as the notification mock
// above - recordActivity/recordBulkActivity are covered by their own unit
// tests (activityLog.service.spec.ts).
vi.mock('./activityLog.service.ts', () => ({
  recordActivity: vi.fn().mockResolvedValue(undefined),
  recordBulkActivity: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of [
      'select',
      'eq',
      'neq',
      'is',
      'gte',
      'lte',
      'in',
      'update',
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const PENDING_ENTRY = {
  id: 'entry-1',
  stay_id: 'stay-1',
  completed_at: null,
  description: 'Morning meal',
  stays: { branch_id: 'branch-1', pet_id: 'pet-1' },
};

describe('careLogCompletion.service (#76)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('AC-1: sets completed_at/completed_by server-side, not from the request', async () => {
    queueFromResults(
      { data: PENDING_ENTRY, error: null },
      {
        data: {
          id: 'entry-1',
          stay_id: 'stay-1',
          completed_at: '2026-08-01T00:00:00.000Z',
          completed_by: 'staff-9',
          description: 'Morning meal',
          stays: { branch_id: 'branch-1' },
        },
        error: null,
      }
    );

    const entry = await completeCareLogEntry({
      entryId: 'entry-1',
      completedByStaffId: 'staff-9',
    });

    expect(entry.completed_by).toBe('staff-9');
    expect(entry.completed_at).toBeTruthy();
  });

  it('AC-2: a second completion attempt on an already-completed entry is a clear error, not a second write', async () => {
    queueFromResults({
      data: { ...PENDING_ENTRY, completed_at: '2026-08-01T00:00:00.000Z' },
      error: null,
    });

    await expect(
      completeCareLogEntry({
        entryId: 'entry-1',
        completedByStaffId: 'staff-9',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('AC-3/Issue #99: fires the real notification dispatch on completion - gating now lives entirely in notification_preferences, not a per-stay flag', async () => {
    queueFromResults(
      { data: PENDING_ENTRY, error: null },
      {
        data: {
          id: 'entry-1',
          stay_id: 'stay-1',
          completed_at: 'now',
          completed_by: 'staff-9',
          description: 'Morning meal',
          stays: { branch_id: 'branch-1' },
        },
        error: null,
      }
    );

    await completeCareLogEntry({
      entryId: 'entry-1',
      completedByStaffId: 'staff-9',
    });

    expect(sendCareLogCompletedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-1' }),
      'pet-1'
    );
  });

  describe('getCareLogEntries', () => {
    it('#80 AC-1: returns scheduled entries in range for active stays at the branch', async () => {
      queueFromResults({
        data: [
          { id: 'entry-1', scheduled_date: '2026-08-05', status: 'Pending' },
        ],
        error: null,
      });

      const entries = await getCareLogEntries({
        branchId: 'branch-1',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });

      expect(entries).toHaveLength(1);
    });

    it('Boarding Checklist Kanban redesign: flips a stale Pending/In Progress entry to Missed and persists it, mirroring applyNoShowTransition', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T09:00:00Z'));

      queueFromResults(
        {
          data: [
            {
              id: 'entry-1',
              scheduled_date: '2020-01-01',
              status: 'Pending',
            },
            {
              id: 'entry-2',
              scheduled_date: '2020-01-01',
              status: 'In Progress',
            },
            {
              id: 'entry-3',
              scheduled_date: '2020-01-01',
              status: 'Completed',
            },
          ],
          error: null,
        },
        {
          data: [
            { id: 'entry-1', status: 'Missed' },
            { id: 'entry-2', status: 'Missed' },
          ],
          error: null,
        }
      );

      const entries = await getCareLogEntries({ branchId: 'branch-1' });

      expect(entries.find((entry) => entry.id === 'entry-1')?.status).toBe(
        'Missed'
      );
      expect(entries.find((entry) => entry.id === 'entry-2')?.status).toBe(
        'Missed'
      );
      // Already-terminal Completed entries are left untouched, not
      // included in the bulk update's `in` filter.
      expect(entries.find((entry) => entry.id === 'entry-3')?.status).toBe(
        'Completed'
      );
    });

    it('does not issue a bulk update when nothing is stale', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults({
        data: [
          { id: 'entry-1', scheduled_date: '2026-08-05', status: 'Pending' },
        ],
        error: null,
      });

      const entries = await getCareLogEntries({
        branchId: 'branch-1',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });

      expect(entries[0].status).toBe('Pending');
    });

    it('Custom change (Backlog status): relabels a future-dated Pending entry as Backlog, without any DB write', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T09:00:00Z'));

      queueFromResults({
        data: [
          { id: 'entry-1', scheduled_date: '2026-08-20', status: 'Pending' },
        ],
        error: null,
      });

      const entries = await getCareLogEntries({ branchId: 'branch-1' });

      expect(entries[0].status).toBe('Backlog');
    });

    it('Custom change (Backlog status): a task scheduled for today stays Pending, not Backlog', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T23:30:00Z'));

      queueFromResults({
        data: [
          { id: 'entry-1', scheduled_date: '2026-08-19', status: 'Pending' },
        ],
        error: null,
      });

      const entries = await getCareLogEntries({ branchId: 'branch-1' });

      expect(entries[0].status).toBe('Pending');
    });

    it('Custom change (Backlog status): an In Progress entry scheduled in the future is left untouched (Backlog only ever applies to Pending)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T09:00:00Z'));

      queueFromResults({
        data: [
          {
            id: 'entry-1',
            scheduled_date: '2026-08-20',
            status: 'In Progress',
          },
        ],
        error: null,
      });

      const entries = await getCareLogEntries({ branchId: 'branch-1' });

      expect(entries[0].status).toBe('In Progress');
    });
  });

  describe('assertChecklistComplete (checkout gating, custom change)', () => {
    it('throws 409 when the stay still has Pending/In Progress tasks', async () => {
      queueFromResults({
        data: [
          { id: 'entry-1', status: 'Pending', scheduled_date: '2026-08-05' },
          {
            id: 'entry-2',
            status: 'In Progress',
            scheduled_date: '2026-08-05',
          },
          { id: 'entry-3', status: 'Completed', scheduled_date: '2026-08-04' },
        ],
        error: null,
      });

      await expect(assertChecklistComplete('stay-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('resolves when every task is Completed or Missed', async () => {
      queueFromResults({
        data: [
          { id: 'entry-1', status: 'Completed', scheduled_date: '2026-08-04' },
          { id: 'entry-2', status: 'Missed', scheduled_date: '2026-08-03' },
        ],
        error: null,
      });

      await expect(assertChecklistComplete('stay-1')).resolves.toBeUndefined();
    });

    it('Custom change (Backlog status): a future-dated Pending task does not block an early checkout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T09:00:00Z'));

      queueFromResults({
        data: [
          { id: 'entry-1', status: 'Pending', scheduled_date: '2026-08-20' },
        ],
        error: null,
      });

      await expect(assertChecklistComplete('stay-1')).resolves.toBeUndefined();
    });
  });

  it('404s when the entry does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      completeCareLogEntry({
        entryId: 'entry-x',
        completedByStaffId: 'staff-9',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('startCareLogEntry (Boarding Checklist Kanban, custom change)', () => {
    it('moves a Pending entry to In Progress', async () => {
      queueFromResults({
        data: {
          id: 'entry-1',
          stay_id: 'stay-1',
          status: 'In Progress',
          description: 'Morning meal',
          stays: { branch_id: 'branch-1' },
        },
        error: null,
      });

      const entry = await startCareLogEntry({ entryId: 'entry-1' });

      expect(entry.status).toBe('In Progress');
    });

    it('409s when the entry is not Pending (conditional UPDATE matched no row)', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        startCareLogEntry({ entryId: 'entry-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('reopenCareLogEntry (Boarding Checklist Kanban, custom change)', () => {
    it('moves an In Progress or Completed entry back to Pending, clearing completion fields', async () => {
      queueFromResults({
        data: {
          id: 'entry-1',
          stay_id: 'stay-1',
          status: 'Pending',
          completed_at: null,
          completed_by: null,
          description: 'Morning meal',
          stays: { branch_id: 'branch-1' },
        },
        error: null,
      });

      const entry = await reopenCareLogEntry({ entryId: 'entry-1' });

      expect(entry.status).toBe('Pending');
      expect(entry.completed_at).toBeNull();
    });

    it('409s when the entry is already Pending (conditional UPDATE matched no row)', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        reopenCareLogEntry({ entryId: 'entry-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
