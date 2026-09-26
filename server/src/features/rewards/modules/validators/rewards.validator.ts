import { z } from 'zod';
import { RARITY_TIERS } from '../../rewards.types.ts';

const DISCOUNT_TYPES = ['Percentage', 'Flat'] as const;

/** A weight is a relative number, not a percent - no upper bound tied to
 * 100 (session 114). The cap just keeps it inside numeric(10, 2). */
const weightSchema = z.number().positive().max(1_000_000);

export const createSpinWheelRewardValidator = z
  .object({
    label: z.string().trim().min(1, 'Title is required'),
    discount_type: z.enum(DISCOUNT_TYPES),
    value: z.number().nonnegative(),
    rarity_tier: z.enum(RARITY_TIERS),
    weight: weightSchema,
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
    rarity_tier: z.enum(RARITY_TIERS).optional(),
    weight: weightSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export const createRewardPoolValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().trim().nullable().optional(),
    reward_ids: z.array(z.uuid()).max(200).default([]),
  })
  .strict();

export const updateRewardPoolValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    /** When present, REPLACES the pool's full member list. */
    reward_ids: z.array(z.uuid()).max(200).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

/** POST /rewards/spin - customer_id lets a receptionist trigger an earned
 * spin for a walk-in they're serving, same optional-override pattern as
 * createBookingValidator's own customer_id. Omitted = spin for the caller.
 * promo_id picks which promo's credit (and so which reward pool) to spin;
 * omitted = the oldest unconsumed credit of any promo. */
export const spinRequestValidator = z
  .object({
    customer_id: z.uuid().optional(),
    promo_id: z.uuid().optional(),
  })
  .strict();

export type CreateSpinWheelRewardInput = z.infer<
  typeof createSpinWheelRewardValidator
>;
export type UpdateSpinWheelRewardInput = z.infer<
  typeof updateSpinWheelRewardValidator
>;
export type CreateRewardPoolInput = z.infer<typeof createRewardPoolValidator>;
export type UpdateRewardPoolInput = z.infer<typeof updateRewardPoolValidator>;
export type SpinRequestInput = z.infer<typeof spinRequestValidator>;
