import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  GoalPeriodStats,
  GoalRow,
  GoalsReport,
  GoalStats,
} from '../reports.types.ts';
import type {
  SetGoalGrowthRateInput,
  SetGoalTargetInput,
} from '../modules/validators/goals.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Growth % used for a metric nobody has configured - what the homepage
 * widget's fixed goal was before goals became configurable. */
export const DEFAULT_GOAL_GROWTH_RATE = 10;

/** The "By service" goal lines. "Assessment"/misc bookings still count
 * toward the appointments total but aren't a customer-facing service line. */
const TRACKED_SERVICES: { category: string; label: string }[] = [
  { category: 'Grooming', label: 'Grooming' },
  { category: 'Veterinary', label: 'Veterinary' },
  { category: 'Daycare', label: 'Daycare' },
  { category: 'Hotel', label: 'Pet Hotel' },
];

const EMPTY_PERIOD: GoalPeriodStats = {
  appointments: 0,
  by_category: {},
  revenue: 0,
  revenue_by_category: {},
  new_customers: 0,
  packages: {},
};

function assertSuperadmin(requesterRole: string) {
  if (requesterRole !== 'Superadmin') {
    throwWithStatus(403, 'Only a Superadmin can view or set goals');
  }
}

interface GetGoalsParams {
  requesterRole: string;
  /** YYYY-MM */
  month: string;
  branchId: string | null;
}

/**
 * Custom change (Goals page): every goal line for one month, for one branch
 * or (branchId null) every branch together. Actuals come from
 * get_goal_stats() (20261011258); each line's goal is the exact target saved
 * for that month if there is one, otherwise the previous month's actual plus
 * the metric's growth % (DEFAULT_GOAL_GROWTH_RATE when none is saved).
 *
 * Superadmin-only, re-checked here on top of the route's requireRole - same
 * defense-in-depth convention as getBranchComparison.
 */
export async function getGoals({
  requesterRole,
  month,
  branchId,
}: GetGoalsParams): Promise<GoalsReport> {
  assertSuperadmin(requesterRole);

  const targetMonth = `${month}-01`;

  const growthRatesQuery = supabase
    .from('goal_growth_rates')
    .select('metric_key, growth_rate');
  const targetsQuery = supabase
    .from('goal_monthly_targets')
    .select('metric_key, target_value')
    .eq('target_month', targetMonth);

  const [statsResult, growthRatesResult, targetsResult] = await Promise.all([
    supabase.rpc('get_goal_stats', {
      p_month: targetMonth,
      p_branch_id: branchId,
    }),
    branchId
      ? growthRatesQuery.eq('branch_id', branchId)
      : growthRatesQuery.is('branch_id', null),
    branchId
      ? targetsQuery.eq('branch_id', branchId)
      : targetsQuery.is('branch_id', null),
  ]);

  const error =
    statsResult.error ?? growthRatesResult.error ?? targetsResult.error;
  if (error) throwWithStatus(400, error.message);

  const stats = (statsResult.data ?? {}) as Partial<GoalStats>;
  const current = stats.current ?? EMPTY_PERIOD;
  const previous = stats.previous ?? EMPTY_PERIOD;

  const growthRates = new Map<string, number>(
    (growthRatesResult.data ?? []).map((row) => [
      row.metric_key as string,
      Number(row.growth_rate),
    ])
  );
  const targets = new Map<string, number>(
    (targetsResult.data ?? []).map((row) => [
      row.metric_key as string,
      Number(row.target_value),
    ])
  );

  function buildRow(
    key: string,
    label: string,
    actual: number,
    previousActual: number,
    isMoney = false
  ): GoalRow {
    const growthRate = growthRates.get(key) ?? DEFAULT_GOAL_GROWTH_RATE;
    const target = targets.get(key) ?? null;
    const grown = previousActual * (1 + growthRate / 100);

    return {
      key,
      label,
      actual,
      previous: previousActual,
      goal:
        target ?? (isMoney ? Math.round(grown * 100) / 100 : Math.round(grown)),
      goal_source: target === null ? 'growth' : 'target',
      growth_rate: growthRate,
      target,
    };
  }

  // A package counts if it's listed (active) or was booked in either month,
  // so last month's figure doesn't vanish when a package is retired.
  const packageNames = [
    ...new Set([
      ...Object.keys(current.packages),
      ...Object.keys(previous.packages),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return {
    month,
    branch_id: branchId,
    appointments: buildRow(
      'appointments',
      'All appointments',
      current.appointments,
      previous.appointments
    ),
    services: TRACKED_SERVICES.map(({ category, label }) =>
      buildRow(
        `service:${category}`,
        label,
        current.by_category[category] ?? 0,
        previous.by_category[category] ?? 0
      )
    ),
    revenue: buildRow(
      'revenue',
      'Revenue',
      Number(current.revenue),
      Number(previous.revenue),
      true
    ),
    revenue_services: TRACKED_SERVICES.map(({ category, label }) =>
      buildRow(
        `revenue:${category}`,
        label,
        Number(current.revenue_by_category?.[category] ?? 0),
        Number(previous.revenue_by_category?.[category] ?? 0),
        true
      )
    ),
    new_customers: buildRow(
      'new_customers',
      'New customers',
      current.new_customers,
      previous.new_customers
    ),
    packages: packageNames.map((name) =>
      buildRow(
        `package:${name}`,
        name,
        current.packages[name] ?? 0,
        previous.packages[name] ?? 0
      )
    ),
  };
}

/** Saves a metric's growth % for one scope (a branch, or all branches). It
 * applies to every month that has no exact target. */
export async function setGoalGrowthRate(
  requesterRole: string,
  staffId: string | null,
  input: SetGoalGrowthRateInput
): Promise<void> {
  assertSuperadmin(requesterRole);

  const { error } = await supabase.from('goal_growth_rates').upsert(
    {
      metric_key: input.metric_key,
      branch_id: input.branch_id,
      growth_rate: input.growth_rate,
      updated_by: staffId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'metric_key,branch_id' }
  );

  if (error) throwWithStatus(400, error.message);
}

/** Saves an exact target for one metric in one month - or, with a null
 * target_value, removes it so the goal falls back to the growth %. */
export async function setGoalMonthlyTarget(
  requesterRole: string,
  staffId: string | null,
  input: SetGoalTargetInput
): Promise<void> {
  assertSuperadmin(requesterRole);

  const targetMonth = `${input.month}-01`;

  if (input.target_value === null) {
    const deleteQuery = supabase
      .from('goal_monthly_targets')
      .delete()
      .eq('metric_key', input.metric_key)
      .eq('target_month', targetMonth);

    const { error } = await (input.branch_id
      ? deleteQuery.eq('branch_id', input.branch_id)
      : deleteQuery.is('branch_id', null));

    if (error) throwWithStatus(400, error.message);
    return;
  }

  const { error } = await supabase.from('goal_monthly_targets').upsert(
    {
      metric_key: input.metric_key,
      branch_id: input.branch_id,
      target_month: targetMonth,
      target_value: input.target_value,
      updated_by: staffId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'metric_key,branch_id,target_month' }
  );

  if (error) throwWithStatus(400, error.message);
}
