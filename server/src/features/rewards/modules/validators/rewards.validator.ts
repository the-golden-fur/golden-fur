import { z } from 'zod';

const DISCOUNT_TYPES = ['Percentage', 'Flat'] as const;

/** Partial/PATCH semantics for the singleton, same convention as
 * updatePricingConfigurationValidator/upsertPromoCapConfigurationValidator. */
export const upsertSpinWheelConfigValidator = z
  .object({
    bookings_milestone_interval: z.number().int().positive().optional(),
    spend_threshold_amount: z.number().nonnegative().optional(),
    pity_threshold: z.number().int().positive().optional(),
  })
  .strict();

export const createSpinWheelRewardValidator = z
  .object({
    label: z.string().trim().min(1, 'Label is required'),
    discount_type: z.enum(DISCOUNT_TYPES),
    value: z.number().nonnegative(),
    rarity_percent: z.number().positive().max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.discount_type === 'Percentage' && input.value > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'A percentage value cannot exceed 100',
      });
    }
  });

export const updateSpinWheelRewardValidator = z
  .object({
    label: z.string().trim().min(1).optional(),
    discount_type: z.enum(DISCOUNT_TYPES).optional(),
    value: z.number().nonnegative().optional(),
    rarity_percent: z.number().positive().max(100).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

/** POST /rewards/spin - customer_id lets a receptionist trigger an earned
 * spin for a walk-in they're serving, same optional-override pattern as
 * createBookingValidator's own customer_id. Omitted = spin for the caller. */
export const spinRequestValidator = z
  .object({
    customer_id: z.uuid().optional(),
  })
  .strict();

export type UpsertSpinWheelConfigInput = z.infer<
  typeof upsertSpinWheelConfigValidator
>;
export type CreateSpinWheelRewardInput = z.infer<
  typeof createSpinWheelRewardValidator
>;
export type UpdateSpinWheelRewardInput = z.infer<
  typeof updateSpinWheelRewardValidator
>;
export type SpinRequestInput = z.infer<typeof spinRequestValidator>;
