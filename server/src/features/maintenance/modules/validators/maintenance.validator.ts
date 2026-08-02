import { z } from 'zod';

const CATEGORIES = ['Grooming', 'Hotel', 'Daycare', 'Veterinary'] as const;
const DISCOUNT_TYPES = ['Percentage', 'Flat'] as const;
const PROMO_SCOPE_TYPES = ['all_services', 'specific'] as const;
const BRANCH_SCOPES = ['makati', 'southwoods', 'both'] as const;
const CAP_TYPES = ['percentage', 'flat'] as const;

/** YYYY-MM-DD, matching the promos.start_date/end_date date columns. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

/**
 * Epic B (#81): the Grooming size/coat matrix is derived from base_price +
 * pricing_configuration, not accepted as manual per-cell input - services no
 * longer take a pricing_tiers field on create or update.
 */
export const createServiceValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    category: z.enum(CATEGORIES),
    base_price: z.number().nonnegative(),
    duration_minutes: z.number().int().positive().optional(),
    requires_assessed_pet: z.boolean().optional(),
  })
  .strict();

export const updateServiceValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.enum(CATEGORIES).optional(),
    base_price: z.number().nonnegative().optional(),
    duration_minutes: z.number().int().positive().nullable().optional(),
    is_active: z.boolean().optional(),
    requires_assessed_pet: z.boolean().optional(),
  })
  .strict();

/** Epic B (#80): every field optional - PATCH semantics for the singleton. */
export const updatePricingConfigurationValidator = z
  .object({
    size_s_multiplier: z.number().positive().optional(),
    size_m_multiplier: z.number().positive().optional(),
    size_l_multiplier: z.number().positive().optional(),
    size_xl_multiplier: z.number().positive().optional(),
    long_coat_addon: z.number().nonnegative().optional(),
  })
  .strict();

/** Epic B (#82): fraction of the included services' base_price sum. */
export const updatePackagePricingConfigurationValidator = z
  .object({
    bundle_discount_percentage: z.number().min(0).max(1),
  })
  .strict();

/**
 * Epic B (#84): branch_id null/omitted targets the system-wide default cap,
 * matching promo_cap_configuration's NULL-branch convention.
 */
export const upsertPromoCapConfigurationValidator = z
  .object({
    branch_id: z.uuid().nullable().optional(),
    cap_type: z.enum(CAP_TYPES),
    cap_value: z.number().nonnegative(),
  })
  .strict();

export const branchAvailabilityValidator = z
  .object({
    branch_id: z.uuid(),
    is_available: z.boolean(),
  })
  .strict();

/**
 * Packages bundle "two or more services" per the #41 user story, hence
 * min(2). branch_id is required on create - a package is always scoped to
 * exactly one branch (MA22); "the same" package at both branches is two rows.
 * Epic B (#83): bundled_price is no longer accepted - it is derived from the
 * included services' base_price and package_pricing_configuration.
 */
export const createPackageValidator = z
  .object({
    branch_id: z.uuid(),
    name: z.string().trim().min(1, 'Name is required'),
    service_ids: z
      .array(z.uuid())
      .min(2, 'A package bundles two or more services'),
  })
  .strict();

export const updatePackageValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
    /** Full replacement of the included-services set when provided. */
    service_ids: z.array(z.uuid()).min(2).optional(),
  })
  .strict();

export const promoScopeItemValidator = z
  .object({
    service_id: z.uuid().optional(),
    package_id: z.uuid().optional(),
  })
  .strict()
  .refine(
    (item) => (item.service_id ? 1 : 0) + (item.package_id ? 1 : 0) === 1,
    'Each scope item targets exactly one of service_id or package_id'
  );

function validatePromoShape(
  input: {
    start_date?: string | null;
    end_date?: string | null;
    condition_note?: string | null;
    discount_type?: (typeof DISCOUNT_TYPES)[number];
    value?: number;
    scope_type?: (typeof PROMO_SCOPE_TYPES)[number];
    scope?: Array<unknown>;
  },
  ctx: z.RefinementCtx,
  { requireWindow }: { requireWindow: boolean }
) {
  const hasStart = input.start_date != null;
  const hasEnd = input.end_date != null;
  const hasCondition = Boolean(input.condition_note?.trim());

  if (hasCondition && (hasStart || hasEnd)) {
    ctx.addIssue({
      code: 'custom',
      path: ['condition_note'],
      message:
        'A promo is either date-bounded or condition-based, not both - omit the dates for a condition-based promo',
    });
  }

  if (requireWindow && !hasCondition && (!hasStart || !hasEnd)) {
    ctx.addIssue({
      code: 'custom',
      path: ['start_date'],
      message:
        'A date-bounded promo needs both start_date and end_date; a condition-based one needs condition_note',
    });
  }

  if (
    hasStart &&
    hasEnd &&
    (input.end_date as string) < (input.start_date as string)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['end_date'],
      message: 'end_date must be on or after start_date',
    });
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

  // 'all_services' requires no scope rows; 'specific' requires at least one
  // (#42 Dev Notes - enforced in the validator, not just the controller).
  if (input.scope_type === 'all_services' && input.scope?.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['scope'],
      message: "scope must be empty when scope_type is 'all_services'",
    });
  }

  if (input.scope_type === 'specific' && !input.scope?.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['scope'],
      message: "scope_type 'specific' requires at least one scope item",
    });
  }
}

/**
 * Epic B (#84): is_exclusive is dropped - combinability is now governed
 * globally by promo_cap_configuration, not declared per promo.
 */
export const createPromoValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    start_date: dateString.optional(),
    end_date: dateString.optional(),
    condition_note: z.string().trim().min(1).optional(),
    discount_type: z.enum(DISCOUNT_TYPES),
    value: z.number().nonnegative(),
    scope_type: z.enum(PROMO_SCOPE_TYPES),
    scope: z.array(promoScopeItemValidator).optional(),
    branch_scope: z.enum(BRANCH_SCOPES),
  })
  .strict()
  .superRefine((input, ctx) =>
    validatePromoShape(input, ctx, { requireWindow: true })
  );

/**
 * Partial update: pair rules are enforced on whatever is present (the
 * service layer validates the merged result against the existing row for
 * cross-field cases like scope_type changes).
 */
export const updatePromoValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    start_date: dateString.nullable().optional(),
    end_date: dateString.nullable().optional(),
    condition_note: z.string().trim().min(1).nullable().optional(),
    discount_type: z.enum(DISCOUNT_TYPES).optional(),
    value: z.number().nonnegative().optional(),
    scope_type: z.enum(PROMO_SCOPE_TYPES).optional(),
    scope: z.array(promoScopeItemValidator).optional(),
    branch_scope: z.enum(BRANCH_SCOPES).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, ctx) =>
    validatePromoShape(input, ctx, { requireWindow: false })
  );

const PET_TYPES = ['Dog', 'Cat'] as const;

/** Epic A follow-up: breeds CRUD (previously seed-only, migration 20260725045). */
export const createBreedValidator = z
  .object({
    pet_type: z.enum(PET_TYPES),
    name: z.string().trim().min(1, 'Name is required'),
  })
  .strict();

export const updateBreedValidator = z
  .object({
    pet_type: z.enum(PET_TYPES).optional(),
    name: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateServiceInput = z.infer<typeof createServiceValidator>;
export type UpdateServiceInput = z.infer<typeof updateServiceValidator>;
export type BranchAvailabilityInput = z.infer<
  typeof branchAvailabilityValidator
>;
export type CreatePackageInput = z.infer<typeof createPackageValidator>;
export type UpdatePackageInput = z.infer<typeof updatePackageValidator>;
export type CreatePromoInput = z.infer<typeof createPromoValidator>;
export type UpdatePromoInput = z.infer<typeof updatePromoValidator>;
export type CreateBreedInput = z.infer<typeof createBreedValidator>;
export type UpdateBreedInput = z.infer<typeof updateBreedValidator>;
export type UpdatePricingConfigurationInput = z.infer<
  typeof updatePricingConfigurationValidator
>;
export type UpdatePackagePricingConfigurationInput = z.infer<
  typeof updatePackagePricingConfigurationValidator
>;
export type UpsertPromoCapConfigurationInput = z.infer<
  typeof upsertPromoCapConfigurationValidator
>;
