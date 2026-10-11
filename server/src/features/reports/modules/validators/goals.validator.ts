import { z } from 'zod';

// Mirrors the CHECK constraints on goal_growth_rates/goal_monthly_targets
// (20261011258).
const metricKey = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^(appointments|revenue|new_customers|service:.+|revenue:.+|package:.+)$/,
    {
      message: 'Unknown goal metric',
    }
  );

/** null = the "All branches" goal. */
const branchId = z.string().uuid().nullable();

/** A calendar month, e.g. "2026-10". */
export const goalMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: 'month must be YYYY-MM',
});

export const goalsQueryValidator = z.object({
  month: goalMonth,
  branch_id: z.string().uuid().optional(),
});

export const setGoalGrowthRateValidator = z
  .object({
    metric_key: metricKey,
    branch_id: branchId,
    growth_rate: z.number().min(0).max(1000),
  })
  .strict();

export const setGoalTargetValidator = z
  .object({
    metric_key: metricKey,
    branch_id: branchId,
    month: goalMonth,
    /** null clears the exact target, falling back to the growth %. */
    target_value: z.number().min(0).max(9_999_999_999).nullable(),
  })
  .strict();

export type SetGoalGrowthRateInput = z.infer<typeof setGoalGrowthRateValidator>;
export type SetGoalTargetInput = z.infer<typeof setGoalTargetValidator>;
