import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeCareLogEntry,
  getTodayCareLogEntries,
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

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'neq', 'is', 'update']) {
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
  stays: { pet_id: 'pet-1' },
};

describe('careLogCompletion.service (#76)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-1: sets completed_at/completed_by server-side, not from the request', async () => {
    queueFromResults(
      { data: PENDING_ENTRY, error: null },
      {
        data: {
          id: 'entry-1',
          completed_at: '2026-08-01T00:00:00.000Z',
          completed_by: 'staff-9',
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
        data: { id: 'entry-1', completed_at: 'now', completed_by: 'staff-9' },
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

  describe('getTodayCareLogEntries', () => {
    it("#80 AC-1: returns today's scheduled entries for active stays at the branch", async () => {
      queueFromResults({
        data: [{ id: 'entry-1', scheduled_date: '2026-08-05' }],
        error: null,
      });

      const entries = await getTodayCareLogEntries({
        branchId: 'branch-1',
        date: '2026-08-05',
      });

      expect(entries).toHaveLength(1);
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
        data: { id: 'entry-1', status: 'In Progress' },
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
          status: 'Pending',
          completed_at: null,
          completed_by: null,
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
