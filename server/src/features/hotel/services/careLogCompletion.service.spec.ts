import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeCareLogEntry,
  getTodayCareLogEntries,
} from './careLogCompletion.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
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

    for (const method of ['select', 'eq', 'is', 'update']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const PENDING_ENTRY = {
  id: 'entry-1',
  hotel_stay_id: 'stay-1',
  completed_at: null,
  hotel_stays: { notify_opt_in: true },
};

describe('careLogCompletion.service (#76)', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
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

  it('AC-3: fires the stub event when notify_opt_in is true', async () => {
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

    expect(infoSpy).toHaveBeenCalled();
  });

  it('AC-3: does not fire the event when notify_opt_in is false, but still records completion', async () => {
    queueFromResults(
      {
        data: { ...PENDING_ENTRY, hotel_stays: { notify_opt_in: false } },
        error: null,
      },
      {
        data: { id: 'entry-1', completed_at: 'now', completed_by: 'staff-9' },
        error: null,
      }
    );

    const entry = await completeCareLogEntry({
      entryId: 'entry-1',
      completedByStaffId: 'staff-9',
    });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(entry.completed_at).toBe('now');
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
});
