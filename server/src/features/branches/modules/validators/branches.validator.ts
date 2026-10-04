import { z } from 'zod';
import { WEEKDAYS, type OperatingHours } from '../../branches.types.ts';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const operatingHoursEntryValidator = z
  .object({
    open: z.string().regex(TIME_PATTERN, 'Use HH:MM (24h)'),
    close: z.string().regex(TIME_PATTERN, 'Use HH:MM (24h)'),
  })
  .strict()
  .refine((entry) => entry.open < entry.close, {
    message: 'close must be after open',
    path: ['close'],
  });

const operatingHoursValidator = z
  .object(
    Object.fromEntries(
      WEEKDAYS.map((day) => [day, operatingHoursEntryValidator.optional()])
    )
  )
  .strict();

/**
 * Custom change (per-branch Grooming hours): a day's Grooming time must fall
 * on a day the branch is open and inside that day's operating hours. Only
 * checked when the same payload carries both maps - the Configure branch
 * form always sends them together; a payload with just one is still clamped
 * to the operating hours at read time (availability.service.ts's
 * resolveCategoryWindow), so it can never widen them.
 */
function refineGroomingWithinOperatingHours(
  value: { operating_hours?: unknown; grooming_hours?: unknown },
  ctx: z.RefinementCtx
): void {
  if (!value.operating_hours || !value.grooming_hours) return;

  const operatingHours = value.operating_hours as OperatingHours;
  const groomingHours = value.grooming_hours as OperatingHours;

  for (const day of WEEKDAYS) {
    const grooming = groomingHours[day];
    if (!grooming) continue;

    const operating = operatingHours[day];

    if (!operating) {
      ctx.addIssue({
        code: 'custom',
        message: 'Grooming hours cannot be set on a day the branch is closed',
        path: ['grooming_hours', day],
      });
    } else if (
      grooming.open < operating.open ||
      grooming.close > operating.close
    ) {
      ctx.addIssue({
        code: 'custom',
        message: "Grooming hours must be within that day's operating hours",
        path: ['grooming_hours', day],
      });
    }
  }
}

export const updateBranchValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    contact_number: z.string().trim().min(1).nullable().optional(),
    is_vet_branch: z.boolean().optional(),
    timezone: z.string().trim().min(1).optional(),
    operating_hours: operatingHoursValidator.optional(),
    grooming_hours: operatingHoursValidator.optional(),
    /** Deactivate/reactivate - a plain field update, same as promos'
     * updatePromo, not a dedicated endpoint. */
    is_active: z.boolean().optional(),
  })
  .strict()
  .superRefine(refineGroomingWithinOperatingHours);

export type UpdateBranchInput = z.infer<typeof updateBranchValidator>;

export const createBranchValidator = z
  .object({
    name: z.string().trim().min(1),
    address: z.string().trim().min(1),
    contact_number: z.string().trim().min(1).nullable().optional(),
    is_vet_branch: z.boolean().optional().default(false),
    timezone: z.string().trim().min(1),
    operating_hours: operatingHoursValidator.optional().default({}),
    grooming_hours: operatingHoursValidator.optional().default({}),
  })
  .strict()
  .superRefine(refineGroomingWithinOperatingHours);

export type CreateBranchInput = z.infer<typeof createBranchValidator>;
