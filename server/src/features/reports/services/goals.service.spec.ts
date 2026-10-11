import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGoals,
  setGoalGrowthRate,
  setGoalMonthlyTarget,
} from './goals.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

const STATS = {
  current: {
    appointments: 12,
    by_category: { Grooming: 8, Hotel: 4 },
    revenue: 9000,
    revenue_by_category: { Grooming: 6000, Hotel: 2500 },
    new_customers: 3,
    packages: { 'Spa Day': 2, 'Puppy Starter': 0 },
  },
  previous: {
    appointments: 10,
    by_category: { Grooming: 6, Veterinary: 4 },
    revenue: 8000.5,
    revenue_by_category: { Grooming: 5000 },
    new_customers: 5,
    packages: { 'Spa Day': 4, 'Old Bundle': 1 },
  },
};

/** A chainable stand-in for a Supabase query: every filter returns the same
 * object, and awaiting it resolves to `result`. Calls are recorded so a test
 * can assert which filters ran. */
function queryStub(result: { data?: unknown; error?: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const stub: Record<string, unknown> = {
    calls,
    then: (resolve: (_value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, ...result }).then(resolve),
  };
  for (const method of ['select', 'eq', 'is', 'upsert', 'delete']) {
    stub[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return stub;
    };
  }
  return stub as { calls: typeof calls };
}

function mockTables(tables: Record<string, ReturnType<typeof queryStub>>) {
  vi.mocked(supabase.from).mockImplementation(
    (table: string) => tables[table] as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.rpc).mockResolvedValue({
    data: STATS,
    error: null,
  } as never);
});

describe('getGoals', () => {
  it('defaults every goal to the previous month + 10%', async () => {
    const growthRates = queryStub({ data: [] });
    const targets = queryStub({ data: [] });
    mockTables({
      goal_growth_rates: growthRates,
      goal_monthly_targets: targets,
    });

    const goals = await getGoals({
      requesterRole: 'Superadmin',
      month: '2026-10',
      branchId: null,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_goal_stats', {
      p_month: '2026-10-01',
      p_branch_id: null,
    });
    expect(goals.appointments).toMatchObject({
      key: 'appointments',
      actual: 12,
      previous: 10,
      goal: 11,
      goal_source: 'growth',
      growth_rate: 10,
      target: null,
    });
    // Money keeps its cents: 8000.5 * 1.1 = 8800.55
    expect(goals.revenue.goal).toBe(8800.55);
    expect(goals.new_customers.goal).toBe(6);
    // All-branches goals are the branch_id null rows.
    expect(growthRates.calls).toContainEqual(['is', 'branch_id', null]);
    expect(targets.calls).toContainEqual(['eq', 'target_month', '2026-10-01']);
  });

  it('always lists the four services, at zero when nothing was booked', async () => {
    mockTables({
      goal_growth_rates: queryStub({ data: [] }),
      goal_monthly_targets: queryStub({ data: [] }),
    });

    const goals = await getGoals({
      requesterRole: 'Superadmin',
      month: '2026-10',
      branchId: null,
    });

    expect(goals.services.map((row) => [row.label, row.actual])).toEqual([
      ['Grooming', 8],
      ['Veterinary', 0],
      ['Daycare', 0],
      ['Pet Hotel', 4],
    ]);
  });

  it('breaks revenue out by service, as money', async () => {
    mockTables({
      goal_growth_rates: queryStub({
        data: [{ metric_key: 'revenue:Grooming', growth_rate: '12.50' }],
      }),
      goal_monthly_targets: queryStub({ data: [] }),
    });

    const goals = await getGoals({
      requesterRole: 'Superadmin',
      month: '2026-10',
      branchId: null,
    });

    expect(
      goals.revenue_services.map((row) => [row.key, row.actual, row.goal])
    ).toEqual([
      // 5000 * 1.125
      ['revenue:Grooming', 6000, 5625],
      ['revenue:Veterinary', 0, 0],
      ['revenue:Daycare', 0, 0],
      ['revenue:Hotel', 2500, 0],
    ]);
  });

  it('lists every package seen in either month, by name', async () => {
    mockTables({
      goal_growth_rates: queryStub({ data: [] }),
      goal_monthly_targets: queryStub({ data: [] }),
    });

    const goals = await getGoals({
      requesterRole: 'Superadmin',
      month: '2026-10',
      branchId: null,
    });

    expect(
      goals.packages.map((row) => [row.key, row.actual, row.previous])
    ).toEqual([
      ['package:Old Bundle', 0, 1],
      ['package:Puppy Starter', 0, 0],
      ['package:Spa Day', 2, 4],
    ]);
  });

  it('uses a saved growth rate, and an exact target over both', async () => {
    const growthRates = queryStub({
      data: [
        { metric_key: 'appointments', growth_rate: '50.00' },
        { metric_key: 'revenue', growth_rate: '25.00' },
      ],
    });
    const targets = queryStub({
      data: [{ metric_key: 'revenue', target_value: '20000.00' }],
    });
    mockTables({
      goal_growth_rates: growthRates,
      goal_monthly_targets: targets,
    });

    const goals = await getGoals({
      requesterRole: 'Superadmin',
      month: '2026-10',
      branchId: 'branch-makati',
    });

    expect(goals.appointments).toMatchObject({ goal: 15, growth_rate: 50 });
    expect(goals.revenue).toMatchObject({
      goal: 20000,
      goal_source: 'target',
      growth_rate: 25,
      target: 20000,
    });
    // A branch's goals are its own rows, not the all-branches ones.
    expect(growthRates.calls).toContainEqual([
      'eq',
      'branch_id',
      'branch-makati',
    ]);
    expect(targets.calls).toContainEqual(['eq', 'branch_id', 'branch-makati']);
  });

  it.each(['Admin', 'Supervisor', 'Cashier'])(
    'rejects a %s with 403 without calling the database',
    async (role) => {
      await expect(
        getGoals({ requesterRole: role, month: '2026-10', branchId: null })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(supabase.rpc).not.toHaveBeenCalled();
    }
  );

  it('surfaces a database error as 400', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    } as never);
    mockTables({
      goal_growth_rates: queryStub({ data: [] }),
      goal_monthly_targets: queryStub({ data: [] }),
    });

    await expect(
      getGoals({
        requesterRole: 'Superadmin',
        month: '2026-10',
        branchId: null,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: 'boom' });
  });
});

describe('setGoalGrowthRate', () => {
  it('upserts the rate for the metric and scope', async () => {
    const growthRates = queryStub({});
    mockTables({ goal_growth_rates: growthRates });

    await setGoalGrowthRate('Superadmin', 'staff-1', {
      metric_key: 'revenue',
      branch_id: null,
      growth_rate: 20,
    });

    expect(growthRates.calls[0]).toEqual([
      'upsert',
      expect.objectContaining({
        metric_key: 'revenue',
        branch_id: null,
        growth_rate: 20,
        updated_by: 'staff-1',
      }),
      { onConflict: 'metric_key,branch_id' },
    ]);
  });

  it('rejects a non-Superadmin with 403', async () => {
    await expect(
      setGoalGrowthRate('Admin', 'staff-1', {
        metric_key: 'revenue',
        branch_id: null,
        growth_rate: 20,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('setGoalMonthlyTarget', () => {
  it('upserts an exact target on the first of the month', async () => {
    const targets = queryStub({});
    mockTables({ goal_monthly_targets: targets });

    await setGoalMonthlyTarget('Superadmin', 'staff-1', {
      metric_key: 'package:Spa Day',
      branch_id: 'branch-makati',
      month: '2026-12',
      target_value: 30,
    });

    expect(targets.calls[0]).toEqual([
      'upsert',
      expect.objectContaining({
        metric_key: 'package:Spa Day',
        branch_id: 'branch-makati',
        target_month: '2026-12-01',
        target_value: 30,
      }),
      { onConflict: 'metric_key,branch_id,target_month' },
    ]);
  });

  it('deletes the target when cleared, scoped to all branches', async () => {
    const targets = queryStub({});
    mockTables({ goal_monthly_targets: targets });

    await setGoalMonthlyTarget('Superadmin', 'staff-1', {
      metric_key: 'revenue',
      branch_id: null,
      month: '2026-12',
      target_value: null,
    });

    expect(targets.calls).toEqual([
      ['delete'],
      ['eq', 'metric_key', 'revenue'],
      ['eq', 'target_month', '2026-12-01'],
      ['is', 'branch_id', null],
    ]);
  });
});
