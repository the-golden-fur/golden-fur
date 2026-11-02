import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeveloperStats } from './developerStats.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface CountResult {
  count: number | null;
  error: unknown;
}

function queueFromResults(...results: CountResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { count: 0, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.then = (resolve: (_result: CountResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('getDeveloperStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns every count, in the order the queries are issued', async () => {
    queueFromResults(
      { count: 120, error: null }, // total customers
      { count: 7, error: null }, // deactivated customers
      { count: 40, error: null }, // total staff
      { count: 2, error: null }, // deactivated staff
      { count: 3, error: null } // pending bug reports
    );

    await expect(getDeveloperStats()).resolves.toEqual({
      total_customers: 120,
      deactivated_customers: 7,
      total_staff: 40,
      deactivated_staff: 2,
      pending_bug_reports: 3,
    });
  });

  it('treats a null count as 0', async () => {
    queueFromResults(
      { count: null, error: null },
      { count: null, error: null },
      { count: null, error: null },
      { count: null, error: null },
      { count: null, error: null }
    );

    await expect(getDeveloperStats()).resolves.toEqual({
      total_customers: 0,
      deactivated_customers: 0,
      total_staff: 0,
      deactivated_staff: 0,
      pending_bug_reports: 0,
    });
  });

  it('throws if any of the five queries fails', async () => {
    queueFromResults(
      { count: 1, error: null },
      { count: 1, error: { message: 'db down' } },
      { count: 1, error: null },
      { count: 1, error: null },
      { count: 1, error: null }
    );

    await expect(getDeveloperStats()).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
