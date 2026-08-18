import { z } from 'zod';

const CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
] as const;
const DISCOUNT_TYPES = ['Percentage', 'Flat'] as const;
const PROMO_SCOPE_TYPES = ['all_services', 'specific'] as const;
const BRANCH_SCOPES = ['makati', 'southwoods', 'both'] as const;
const CAP_TYPES = ['percentage', 'flat', 'count'] as const;
const PRICING_RULE_TYPES = ['multiplier', 'flat', 'percentage'] as const;
const DOWNPAYMENT_TYPES = ['Flat', 'Percentage'] as const;

/** YYYY-MM-DD, matching the promos.start_date/end_date date columns. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

/**
 * Epic B (#81): the Grooming size/coat matrix is derived from base_price +
 * pricing_configuration, not accepted as manual per-cell input - services no
 * longer take a pricing_tiers field on create or update.
 */
/**
 * Custom change (Daycare fee configuration follow-up): base_price is
 * required for every category except Daycare, where it's derived
 * server-side from first_hour_fee (services.service.ts) instead of
 * admin-entered - "why are there so many prices to config" was resolved by
 * dropping the redundant Daycare input rather than the column itself
 * (base_price still backs the booking-time pricing snapshot everywhere).
 */
function requireDaycareFeesOrBasePrice(
  input: {
    category?: (typeof CATEGORIES)[number];
    base_price?: number;
    first_hour_fee?: number;
    succeeding_hour_fee?: number;
  },
  ctx: z.RefinementCtx
) {
  if (input.category === 'Daycare') {
    if (input.first_hour_fee === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['first_hour_fee'],
        message: 'A Daycare service requires a first-hour fee',
      });
    }
    if (input.succeeding_hour_fee === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['succeeding_hour_fee'],
        message: 'A Daycare service requires a succeeding-hour fee',
      });
    }
  } else if (input.base_price === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['base_price'],
      message: 'base_price is required for non-Daycare services',
    });
  }
}

/**
 * Custom change (P-1 roadmap item: generic downpayment, later revised to
 * flat-or-percentage): mirrors the DB's own
 * services_downpayment_amount_check/packages_downpayment_amount_check
 * constraints (20260808110/20260808112) at the validator layer, same "not
 * category-gated" convention as every other optional service/package field
 * above. downpayment_type is required alongside the amount once
 * requires_downpayment is true; a 'Percentage' type additionally caps the
 * amount at 100.
 */
function requireDownpaymentAmount(
  input: {
    requires_downpayment?: boolean;
    downpayment_amount?: number | null;
    downpayment_type?: (typeof DOWNPAYMENT_TYPES)[number] | null;
  },
  ctx: z.RefinementCtx
) {
  if (input.requires_downpayment === false) {
    if (input.downpayment_amount != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['downpayment_amount'],
        message:
          'downpayment_amount must be null when requires_downpayment is false',
      });
    }

    if (input.downpayment_type != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['downpayment_type'],
        message:
          'downpayment_type must be null when requires_downpayment is false',
      });
    }

    return;
  }

  if (!input.requires_downpayment) return;

  if (
    input.downpayment_amount === undefined ||
    input.downpayment_amount === null ||
    input.downpayment_amount <= 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['downpayment_amount'],
      message:
        'A positive downpayment_amount is required when requires_downpayment is true',
    });
  }

  if (!input.downpayment_type) {
    ctx.addIssue({
      code: 'custom',
      path: ['downpayment_type'],
      message:
        'downpayment_type ("Flat" or "Percentage") is required when requires_downpayment is true',
    });
  }

  if (
    input.downpayment_type === 'Percentage' &&
    input.downpayment_amount != null &&
    input.downpayment_amount > 100
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['downpayment_amount'],
      message: 'A percentage downpayment cannot exceed 100',
    });
  }
}

export const createServiceValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    category: z.enum(CATEGORIES),
    // Optional here (not per-category-gated at the schema level) since
    // Daycare instead derives it from first_hour_fee - see
    // requireDaycareFeesOrBasePrice below.
    base_price: z.number().nonnegative().optional(),
    duration_minutes: z.number().int().positive().optional(),
    requires_assessed_pet: z.boolean().optional(),
    // Hotel-only ("5+ nights -> free Golden Package" board condition) -
    // meaningless for other categories but not category-gated here, mirroring
    // duration_minutes' own "accepted, just unused elsewhere" convention.
    min_nights_for_free_package: z.number().int().positive().optional(),
    free_package_name: z.string().trim().min(1).optional(),
    // Custom change (pricing matrix fix): opt-in per service - meaningful
    // for Grooming only, but not category-gated here, same convention as
    // duration_minutes.
    use_pricing_matrix: z.boolean().optional(),
    // Custom change (Daycare fee configuration): Daycare-only - meaningful
    // for Daycare only, but not category-gated here, same convention as
    // every other category-specific optional field above.
    first_hour_fee: z.number().nonnegative().optional(),
    succeeding_hour_fee: z.number().nonnegative().optional(),
    // Custom change (Daycare fee configuration follow-up): optional even
    // for Daycare - falls back to the documented ₱850 default when omitted.
    daycare_overnight_fee: z.number().nonnegative().optional(),
    // Custom change (P-1 roadmap item: generic downpayment) - not category-
    // gated, see requireDownpaymentAmount above.
    requires_downpayment: z.boolean().optional(),
    downpayment_amount: z.number().positive().optional(),
    downpayment_type: z.enum(DOWNPAYMENT_TYPES).optional(),
  })
  .strict()
  .superRefine(requireDaycareFeesOrBasePrice)
  .superRefine(requireDownpaymentAmount);

export const updateServiceValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.enum(CATEGORIES).optional(),
    base_price: z.number().nonnegative().optional(),
    duration_minutes: z.number().int().positive().nullable().optional(),
    is_active: z.boolean().optional(),
    requires_assessed_pet: z.boolean().optional(),
    min_nights_for_free_package: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
    free_package_name: z.string().trim().min(1).nullable().optional(),
    use_pricing_matrix: z.boolean().optional(),
    first_hour_fee: z.number().nonnegative().nullable().optional(),
    succeeding_hour_fee: z.number().nonnegative().nullable().optional(),
    daycare_overnight_fee: z.number().nonnegative().nullable().optional(),
    requires_downpayment: z.boolean().optional(),
    downpayment_amount: z.number().positive().nullable().optional(),
    downpayment_type: z.enum(DOWNPAYMENT_TYPES).nullable().optional(),
  })
  .strict()
  .superRefine(requireDownpaymentAmount);

/**
 * Custom change (configurable pricing rules): every field optional - PATCH
 * semantics for the singleton, same as before. A `_rule_value` of exactly 0
 * is only rejected when its paired `_rule_type` is 'multiplier' *in the same
 * request* (a 0 multiplier would silently zero out that size's price) -
 * flat/percentage rules may legitimately be 0. If the type isn't part of
 * this particular PATCH, the value is trusted as-is (whatever it's paired
 * with server-side is unknown from a single field's update).
 */
function rejectZeroMultiplier(
  ruleType: (typeof PRICING_RULE_TYPES)[number] | undefined,
  ruleValue: number | undefined,
  path: string,
  ctx: z.RefinementCtx
) {
  if (ruleType === 'multiplier' && ruleValue === 0) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: 'A multiplier rule cannot be zero',
    });
  }
}

export const updatePricingConfigurationValidator = z
  .object({
    size_s_rule_type: z.enum(PRICING_RULE_TYPES).optional(),
    size_s_rule_value: z.number().nonnegative().optional(),
    size_m_rule_type: z.enum(PRICING_RULE_TYPES).optional(),
    size_m_rule_value: z.number().nonnegative().optional(),
    size_l_rule_type: z.enum(PRICING_RULE_TYPES).optional(),
    size_l_rule_value: z.number().nonnegative().optional(),
    size_xl_rule_type: z.enum(PRICING_RULE_TYPES).optional(),
    size_xl_rule_value: z.number().nonnegative().optional(),
    coat_long_rule_type: z.enum(PRICING_RULE_TYPES).optional(),
    coat_long_rule_value: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    rejectZeroMultiplier(
      input.size_s_rule_type,
      input.size_s_rule_value,
      'size_s_rule_value',
      ctx
    );
    rejectZeroMultiplier(
      input.size_m_rule_type,
      input.size_m_rule_value,
      'size_m_rule_value',
      ctx
    );
    rejectZeroMultiplier(
      input.size_l_rule_type,
      input.size_l_rule_value,
      'size_l_rule_value',
      ctx
    );
    rejectZeroMultiplier(
      input.size_xl_rule_type,
      input.size_xl_rule_value,
      'size_xl_rule_value',
      ctx
    );
    rejectZeroMultiplier(
      input.coat_long_rule_type,
      input.coat_long_rule_value,
      'coat_long_rule_value',
      ctx
    );
  });

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
  .strict()
  .superRefine((input, ctx) => {
    // A 'count' cap limits how many promos may combine - a fractional promo
    // makes no sense, unlike a percentage/flat monetary cap_value.
    if (input.cap_type === 'count' && !Number.isInteger(input.cap_value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cap_value'],
        message: 'A count cap_value must be a whole number of promos',
      });
    }
  });

export const branchAvailabilityValidator = z
  .object({
    branch_id: z.uuid(),
    is_available: z.boolean(),
  })
  .strict();

/**
 * Packages bundle "two or more services" per the #41 user story, hence
 * min(2). Custom change: packages are no longer scoped to exactly one branch
 * (the old MA22 rule) - branch_ids picks which branches this package starts
 * available at, mirroring service_branch_availability/
 * service_type_branch_availability's per-branch model instead of a single
 * owning branch_id column. Epic B (#83): bundled_price is no longer accepted
 * - it is derived from the included services' base_price and
 * package_pricing_configuration.
 */
export const createPackageValidator = z
  .object({
    branch_ids: z.array(z.uuid()).min(1, 'Select at least one branch'),
    name: z.string().trim().min(1, 'Name is required'),
    service_ids: z
      .array(z.uuid())
      .min(2, 'A package bundles two or more services'),
    // Custom change (pricing matrix fix): opt-in weight/coat-derived
    // pricing for this package (sum of included services' own per-pet
    // price, bundle-discounted) instead of the flat bundled_price.
    use_pricing_matrix: z.boolean().optional(),
    // Custom change (P-1 roadmap item: generic downpayment).
    requires_downpayment: z.boolean().optional(),
    downpayment_amount: z.number().positive().optional(),
    downpayment_type: z.enum(DOWNPAYMENT_TYPES).optional(),
  })
  .strict()
  .superRefine(requireDownpaymentAmount);

export const updatePackageValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
    /** Full replacement of the included-services set when provided. */
    service_ids: z.array(z.uuid()).min(2).optional(),
    use_pricing_matrix: z.boolean().optional(),
    requires_downpayment: z.boolean().optional(),
    downpayment_amount: z.number().positive().nullable().optional(),
    downpayment_type: z.enum(DOWNPAYMENT_TYPES).nullable().optional(),
  })
  .strict()
  .superRefine(requireDownpaymentAmount);

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

/** Custom change: Service Types admin CRUD. */
export const createServiceTypeValidator = z
  .object({
    key: z.string().trim().min(1, 'Key is required'),
    name: z.string().trim().min(1, 'Name is required'),
    staff_picker_enabled: z.boolean().optional(),
    cage_picker_enabled: z.boolean().optional(),
  })
  .strict();

export const updateServiceTypeValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
    staff_picker_enabled: z.boolean().optional(),
    cage_picker_enabled: z.boolean().optional(),
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
export type CreateServiceTypeInput = z.infer<typeof createServiceTypeValidator>;
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeValidator>;
export type UpdatePricingConfigurationInput = z.infer<
  typeof updatePricingConfigurationValidator
>;
export type UpdatePackagePricingConfigurationInput = z.infer<
  typeof updatePackagePricingConfigurationValidator
>;
export type UpsertPromoCapConfigurationInput = z.infer<
  typeof upsertPromoCapConfigurationValidator
>;
