import { z } from 'zod';

const DISCOUNT_TYPES = ['Percentage', 'Flat'] as const;
const SCOPE_TYPES = ['service', 'package', 'category'] as const;
const CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
] as const;

/**
 * Exactly one of scope_service_id / scope_package_id / scope_category is
 * set, and it must match scope_type - mirrors the promo_scope
 * exactly-one-of pattern (#39/#42) and the discounts_scope_matches_type
 * CHECK constraint in migration ...033, per #43's Dev Notes.
 */
function validateScopeShape(
  input: {
    scope_type?: (typeof SCOPE_TYPES)[number];
    scope_service_id?: string;
    scope_package_id?: string;
    scope_category?: (typeof CATEGORIES)[number];
    discount_type?: (typeof DISCOUNT_TYPES)[number];
    value?: number;
  },
  ctx: z.RefinementCtx
) {
  if (input.scope_type !== undefined) {
    const scopeFieldsSet =
      (input.scope_service_id ? 1 : 0) +
      (input.scope_package_id ? 1 : 0) +
      (input.scope_category ? 1 : 0);

    const expectedField: Record<(typeof SCOPE_TYPES)[number], boolean> = {
      service: Boolean(input.scope_service_id),
      package: Boolean(input.scope_package_id),
      category: Boolean(input.scope_category),
    };

    if (scopeFieldsSet !== 1 || !expectedField[input.scope_type]) {
      ctx.addIssue({
        code: 'custom',
        path: ['scope_type'],
        message:
          'Exactly one scope field must be set and it must match scope_type ' +
          '(service -> scope_service_id, package -> scope_package_id, category -> scope_category)',
      });
    }
  }

  if (
    input.discount_type === 'Percentage' &&
    input.value !== undefined &&
    input.value > 100
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'A percentage value cannot exceed 100',
    });
  }
}

/**
 * is_mandated is deliberately not accepted on any payload - mandated rows
 * exist only via the #44 seed, and `.strict()` rejects attempts to set the
 * flag through the API (#43 AC-3).
 *
 * Custom change: branch_ids replaces the old single branch_id - mirrors
 * createPackageValidator's branch_ids (many-to-many branch availability,
 * see migration 20260820140).
 */
export const createDiscountValidator = z
  .object({
    branch_ids: z.array(z.uuid()).min(1, 'Select at least one branch'),
    name: z.string().trim().min(1, 'Name is required'),
    discount_type: z.enum(DISCOUNT_TYPES),
    value: z.number().nonnegative(),
    scope_type: z.enum(SCOPE_TYPES),
    scope_service_id: z.uuid().optional(),
    scope_package_id: z.uuid().optional(),
    scope_category: z.enum(CATEGORIES).optional(),
  })
  .strict()
  .superRefine(validateScopeShape);

/**
 * Custom change (unify active/available): is_active is deliberately not
 * accepted here any more - it is derived from branch availability
 * (setDiscountBranchAvailability keeps it in sync), the same way
 * is_mandated is permanently out of reach on this endpoint.
 */
export const updateDiscountValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    discount_type: z.enum(DISCOUNT_TYPES).optional(),
    value: z.number().nonnegative().optional(),
    scope_type: z.enum(SCOPE_TYPES).optional(),
    scope_service_id: z.uuid().optional(),
    scope_package_id: z.uuid().optional(),
    scope_category: z.enum(CATEGORIES).optional(),
  })
  .strict()
  .superRefine(validateScopeShape);

/** Per-branch availability toggle, same shape as maintenance's
 * branchAvailabilityValidator. */
export const discountBranchAvailabilityValidator = z
  .object({
    branch_id: z.uuid(),
    is_available: z.boolean(),
  })
  .strict();

export type CreateDiscountInput = z.infer<typeof createDiscountValidator>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountValidator>;
export type DiscountBranchAvailabilityInput = z.infer<
  typeof discountBranchAvailabilityValidator
>;
