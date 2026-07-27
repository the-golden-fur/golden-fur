import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFlaggedCareLogEntries } from './careLogFlagging.service.ts';
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

    for (const method of ['select', 'eq', 'lte', 'is']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('careLogFlagging.service (#77)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-1: returns entries whose scheduled_date has passed and completed_at is still NULL', async () => {
    queueFromResults({
      data: [
        { id: 'entry-1', scheduled_date: '2026-07-26', completed_at: null },
      ],
      error: null,
    });

    const entries = await getFlaggedCareLogEntries({
      branchId: 'branch-1',
      today: '2026-07-27',
    });

    expect(entries).toHaveLength(1);
  });

  it('AC-2: Superadmin (branchId null) is not scoped to a single branch', async () => {
    queueFromResults({ data: [], error: null });

    await getFlaggedCareLogEntries({ branchId: null, today: '2026-07-27' });

    const builderCalls = vi.mocked(supabase.from).mock.results[0]!.value as {
      eq: ReturnType<typeof vi.fn>;
    };
    const branchScopeCall = builderCalls.eq.mock.calls.find(
      (call) => call[0] === 'hotel_stays.cages.branch_id'
    );
    expect(branchScopeCall).toBeUndefined();
  });

  it('AC-3: a completed entry no longer appears as flagged', async () => {
    queueFromResults({ data: [], error: null });

    const entries = await getFlaggedCareLogEntries({
      branchId: 'branch-1',
      today: '2026-07-27',
    });

    expect(entries).toHaveLength(0);
  });
});
