import { z } from 'zod';

const CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Assessment',
] as const;
/** Mirrors the staff_role Postgres enum and server/client ALL_STAFF_ROLES -
 * feature-local redeclaration (same convention as CATEGORIES above and
 * daycare.types.ts) rather than a cross-feature import. */
const STAFF_ROLES = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
] as const;
const DISCOUNT_TYPES = ['Percentage', 'Flat'] as const;
const PROMO_SCOPE_TYPES = ['all_services', 'specific'] as const;
/** Custom change (promo variations, session 86; spin_wheel, session 114). */
const PROMO_TYPES = ['date_range', 'weekly_recurring', 'spin_wheel'] as const;
/** Session 114: at most one per spin-wheel promo (a single column in
 * spin_wheel_promo_settings - see 20260925211). */
const SPIN_LOGIN_TRIGGERS = [
  'daily_login',
  'weekly_login_streak',
  'monthly_login_streak',
] as const;
const CAP_TYPES = ['percentage', 'flat', 'count'] as const;
const PRICING_RULE_TYPES = ['multiplier', 'flat', 'percentage'] as const;

/** Custom change (Architectural-Change-History): the curated Lucide icon
 * names an admin may pick for a service type/service/package - mirrors the
 * client's own allowlist (client/src/shared/components/IconPicker/
 * serviceIcons.ts) so the two stay in lockstep; validated here (not just a
 * free-text string) so a request can't stash an arbitrary icon name the
 * client-side lookup wouldn't recognize. */
const SERVICE_ICON_NAMES = [
  'Scissors',
  'Bath',
  'PawPrint',
  'Dog',
  'Cat',
  'Bone',
  'Stethoscope',
  'Syringe',
  'HeartPulse',
  'Bed',
  'Home',
  'Droplet',
  'Sparkles',
  'Package',
  'Gift',
  'Utensils',
  'Footprints',
  'ShieldCheck',
  'Calendar',
  'Clock',
  'Star',
  'Scale',
  'Brush',
  'Wind',
  'ClipboardList',
  'Users',
  'MapPin',
  'Building2',
  'Warehouse',
  'Thermometer',
] as const;
const iconField = z.enum(SERVICE_ICON_NAMES).nullable().optional();
/** An uploaded image's public Storage URL (see server/src/shared/services/
 * storage/storage.service.ts and the 'service-images' bucket) - the upload
 * itself happens via its own endpoint first; this field just records the
 * resulting URL against the create/update payload. */
const imageUrlField = z.url().nullable().optional();

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
    // Custom change (payments-queue pet assessment capture) - not category-
    // gated, same convention as requires_assessed_pet above.
    captures_pet_assessment: z.boolean().optional(),
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
    icon: iconField,
    image_url: imageUrlField,
  })
  .strict()
  .superRefine(requireDaycareFeesOrBasePrice);

/** Custom change (unify active/available): is_active is derived from branch
 * availability (setServiceBranchAvailability keeps it in sync) and is
 * deliberately not accepted here any more. */
export const updateServiceValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.enum(CATEGORIES).optional(),
    base_price: z.number().nonnegative().optional(),
    duration_minutes: z.number().int().positive().nullable().optional(),
    requires_assessed_pet: z.boolean().optional(),
    captures_pet_assessment: z.boolean().optional(),
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
    icon: iconField,
    image_url: imageUrlField,
  })
  .strict();

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

/**
 * Architectural-Change-History: the S/M/L/XL kg cut-offs. Every field
 * optional (PATCH semantics for the singleton). Ordering among the fields
 * present in this request is checked here; the full m < l < xl invariant
 * against the merge of supplied + stored values is enforced in
 * petWeightClassConfiguration.service.ts (which has the stored row) and, as a
 * final backstop, by the pet_weight_class_configuration_ordered_check DB
 * constraint.
 */
export const updatePetWeightClassConfigurationValidator = z
  .object({
    m_min_kg: z.number().positive().max(499).optional(),
    l_min_kg: z.number().positive().max(499).optional(),
    xl_min_kg: z.number().positive().max(499).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.m_min_kg !== undefined &&
      input.l_min_kg !== undefined &&
      input.m_min_kg >= input.l_min_kg
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['l_min_kg'],
        message: 'L cut-off must be greater than the M cut-off',
      });
    }
    if (
      input.l_min_kg !== undefined &&
      input.xl_min_kg !== undefined &&
      input.l_min_kg >= input.xl_min_kg
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['xl_min_kg'],
        message: 'XL cut-off must be greater than the L cut-off',
      });
    }
    if (
      input.m_min_kg !== undefined &&
      input.xl_min_kg !== undefined &&
      input.m_min_kg >= input.xl_min_kg
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['xl_min_kg'],
        message: 'XL cut-off must be greater than the M cut-off',
      });
    }
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
    icon: iconField,
    image_url: imageUrlField,
  })
  .strict();

/** Custom change (unify active/available): is_active is derived from branch
 * availability (setPackageBranchAvailability keeps it in sync) and is
 * deliberately not accepted here any more. */
export const updatePackageValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    /** Full replacement of the included-services set when provided. */
    service_ids: z.array(z.uuid()).min(2).optional(),
    use_pricing_matrix: z.boolean().optional(),
    icon: iconField,
    image_url: imageUrlField,
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

/**
 * Session 114: a spin-wheel promo's settings - which reward pool it spins,
 * its pity threshold, and its trigger conditions. The booking and spend
 * triggers combine freely; login_trigger is a single field, so "daily login"
 * vs "weekly streak" vs "monthly streak" can never be enabled together.
 * Every field is nullable so an update can clear one (e.g. turn off the
 * spend trigger); the create/merged-state rules live in
 * validateSpinWheelSettings below.
 */
export const spinWheelSettingsValidator = z
  .object({
    reward_pool_id: z.uuid(),
    pity_threshold: z.number().int().positive().nullable().optional(),
    booking_milestone_interval: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
    spend_threshold_amount: z.number().positive().nullable().optional(),
    login_trigger: z.enum(SPIN_LOGIN_TRIGGERS).nullable().optional(),
    login_streak_days: z.number().int().positive().nullable().optional(),
  })
  .strict();

export type SpinWheelSettingsInput = z.infer<typeof spinWheelSettingsValidator>;

/** Rules for a COMPLETE settings object (a create, or an update merged over
 * the stored row by promos.service.ts). Returns human-readable problems
 * rather than adding zod issues directly so the service layer can reuse it
 * on the merged state. */
export function spinWheelSettingsProblems(
  settings: Partial<SpinWheelSettingsInput>
): Array<{ path: string; message: string }> {
  const problems: Array<{ path: string; message: string }> = [];

  if (!settings.reward_pool_id) {
    problems.push({
      path: 'reward_pool_id',
      message: 'Choose a reward pool for this spin wheel',
    });
  }

  const hasTrigger =
    settings.booking_milestone_interval != null ||
    settings.spend_threshold_amount != null ||
    settings.login_trigger != null;

  if (!hasTrigger) {
    problems.push({
      path: 'booking_milestone_interval',
      message: 'Turn on at least one trigger condition',
    });
  }

  const streakDays = settings.login_streak_days;

  if (settings.login_trigger === 'weekly_login_streak') {
    if (streakDays == null || streakDays < 1 || streakDays > 7) {
      problems.push({
        path: 'login_streak_days',
        message: 'A weekly login streak needs 1 to 7 days',
      });
    }
  } else if (settings.login_trigger === 'monthly_login_streak') {
    if (streakDays == null || streakDays < 1 || streakDays > 31) {
      problems.push({
        path: 'login_streak_days',
        message: 'A monthly login streak needs 1 to 31 days',
      });
    }
  } else if (streakDays != null) {
    problems.push({
      path: 'login_streak_days',
      message: 'Streak days only apply to a weekly or monthly login streak',
    });
  }

  return problems;
}

function validatePromoShape(
  input: {
    promo_type?: (typeof PROMO_TYPES)[number];
    start_date?: string | null;
    end_date?: string | null;
    days_of_week?: number[];
    condition_note?: string | null;
    discount_type?: (typeof DISCOUNT_TYPES)[number];
    value?: number;
    scope_type?: (typeof PROMO_SCOPE_TYPES)[number];
    scope?: Array<unknown>;
  },
  ctx: z.RefinementCtx,
  { requireWindow }: { requireWindow: boolean }
) {
  const promoType = input.promo_type ?? 'date_range';
  const hasStart = input.start_date != null;
  const hasEnd = input.end_date != null;
  const hasCondition = Boolean(input.condition_note?.trim());
  const hasDays = Boolean(input.days_of_week?.length);

  if (hasCondition && (hasStart || hasEnd)) {
    ctx.addIssue({
      code: 'custom',
      path: ['condition_note'],
      message:
        'A promo is either date-bounded or condition-based, not both - omit the dates for a condition-based promo',
    });
  }

  // promo_type is only ever present on the CREATE payload (zod resolves its
  // default there, so input.promo_type is always concrete by this point);
  // updatePromoValidator's schema omits the field entirely (immutable after
  // creation), so input.promo_type is always undefined on an update and
  // this whole type-conditional block is skipped there - same deferred-to-
  // the-service-layer pattern scope_type's own checks below already use for
  // a partial payload (promos.service.ts's updatePromo re-checks the merged
  // existing+updates state, including days_of_week vs. the stored
  // promo_type).
  if (input.promo_type !== undefined) {
    // Session 114: a spin-wheel promo's schedule is its trigger conditions
    // (spin_wheel settings) - dates are an optional overall campaign window,
    // and days_of_week/condition_note never apply.
    if (promoType === 'spin_wheel') {
      if (hasCondition) {
        ctx.addIssue({
          code: 'custom',
          path: ['condition_note'],
          message: 'A spin wheel promo cannot have a condition_note',
        });
      }
      if (hasDays) {
        ctx.addIssue({
          code: 'custom',
          path: ['days_of_week'],
          message:
            "days_of_week is only valid when promo_type is 'weekly_recurring'",
        });
      }
    } else if (promoType === 'weekly_recurring') {
      // Custom change (promo variations): a weekly_recurring promo's
      // "condition"/schedule IS days_of_week - start_date/end_date remain
      // valid as an optional overall campaign window on top of it, but
      // days_of_week and condition_note are mutually exclusive with each
      // other, same as condition_note/dates above.
      if (hasCondition) {
        ctx.addIssue({
          code: 'custom',
          path: ['condition_note'],
          message: 'A weekly recurring promo cannot also have a condition_note',
        });
      }
      if (requireWindow && !hasDays) {
        ctx.addIssue({
          code: 'custom',
          path: ['days_of_week'],
          message:
            'A weekly recurring promo needs at least one day of the week',
        });
      }
    } else {
      if (hasDays) {
        ctx.addIssue({
          code: 'custom',
          path: ['days_of_week'],
          message:
            "days_of_week is only valid when promo_type is 'weekly_recurring'",
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
    }
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
/** Custom change: branch_ids replaces the old branch_scope enum
 * ('makati'/'southwoods'/'both') - mirrors createPackageValidator/
 * createDiscountValidator's own branch_ids (many-to-many branch
 * availability, see migration 20260820141). */
export const createPromoValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    // Immutable after creation (updatePromoValidator omits it) - see the
    // Promo type's own doc comment.
    promo_type: z.enum(PROMO_TYPES).optional().default('date_range'),
    start_date: dateString.optional(),
    end_date: dateString.optional(),
    days_of_week: z.array(z.number().int().min(0).max(6)).min(1).optional(),
    condition_note: z.string().trim().min(1).optional(),
    // Required for every type except spin_wheel (session 114), which has no
    // discount of its own and no per-branch availability - enforced in the
    // superRefine below rather than here so the error names the field.
    discount_type: z.enum(DISCOUNT_TYPES).optional(),
    value: z.number().nonnegative().optional(),
    scope_type: z.enum(PROMO_SCOPE_TYPES).optional(),
    scope: z.array(promoScopeItemValidator).optional(),
    branch_ids: z.array(z.uuid()).optional(),
    /** Only for promo_type 'spin_wheel', and required there. */
    spin_wheel: spinWheelSettingsValidator.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    validatePromoShape(input, ctx, { requireWindow: true });

    if (input.promo_type === 'spin_wheel') {
      for (const field of [
        'discount_type',
        'value',
        'scope_type',
        'scope',
        'branch_ids',
      ] as const) {
        if (input[field] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `A spin wheel promo has no ${field} - its rewards come from the reward pool`,
          });
        }
      }

      if (!input.spin_wheel) {
        ctx.addIssue({
          code: 'custom',
          path: ['spin_wheel'],
          message:
            'A spin wheel promo needs a reward pool and trigger settings',
        });
        return;
      }

      for (const problem of spinWheelSettingsProblems(input.spin_wheel)) {
        ctx.addIssue({
          code: 'custom',
          path: ['spin_wheel', problem.path],
          message: problem.message,
        });
      }
      return;
    }

    if (input.spin_wheel !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['spin_wheel'],
        message:
          "spin_wheel settings are only valid when promo_type is 'spin_wheel'",
      });
    }
    if (input.discount_type === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount_type'],
        message: 'Discount type is required',
      });
    }
    if (input.value === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Discount value is required',
      });
    }
    if (input.scope_type === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['scope_type'],
        message: 'Scope is required',
      });
    }
    if (!input.branch_ids?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['branch_ids'],
        message: 'Select at least one branch',
      });
    }
  });

/**
 * Partial update: pair rules are enforced on whatever is present (the
 * service layer validates the merged result against the existing row for
 * cross-field cases like scope_type changes). branch_ids is deliberately
 * absent - branch changes go through the dedicated branch-availability
 * endpoint, same as Discounts/Services/Packages/Service Types. is_active
 * stays here (unlike those four) - a promo's is_active also drives
 * automatic date-based expiry (promoExpiry.job.ts), independent of branch
 * availability.
 */
export const updatePromoValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    // promo_type itself is deliberately absent - immutable after creation.
    start_date: dateString.nullable().optional(),
    end_date: dateString.nullable().optional(),
    // Full replacement of the day set when provided - only meaningful (and
    // only validated against promo_type) for an existing weekly_recurring
    // promo; the service layer merges this against the stored promo_type,
    // same as every other cross-field check in validatePromoShape.
    days_of_week: z.array(z.number().int().min(0).max(6)).min(1).optional(),
    condition_note: z.string().trim().min(1).nullable().optional(),
    discount_type: z.enum(DISCOUNT_TYPES).optional(),
    value: z.number().nonnegative().optional(),
    scope_type: z.enum(PROMO_SCOPE_TYPES).optional(),
    scope: z.array(promoScopeItemValidator).optional(),
    is_active: z.boolean().optional(),
    // Session 114: partial spin-wheel settings for an existing spin_wheel
    // promo - merged over the stored row and re-checked as a whole by
    // promos.service.ts's updatePromo (spinWheelSettingsProblems).
    spin_wheel: spinWheelSettingsValidator.partial().optional(),
  })
  .strict()
  .superRefine((input, ctx) =>
    validatePromoShape(input, ctx, { requireWindow: false })
  );

// Per-branch availability toggle reuses the shared branchAvailabilityValidator
// above (same shape already used by Services/Packages/Service Types).

/** Epic A follow-up: breeds CRUD (previously seed-only, migration 20260725045).
 * pet_type is no longer a fixed 2-value enum (Pet Types admin CRUD,
 * 20260912191) - it's a foreign key against the admin-managed pet_types
 * table, so the real validation is the DB constraint, not this schema. */
export const createBreedValidator = z
  .object({
    pet_type: z.string().trim().min(1, 'Pet type is required'),
    name: z.string().trim().min(1, 'Name is required'),
  })
  .strict();

export const updateBreedValidator = z
  .object({
    pet_type: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
  })
  .strict();

/** Custom change: Pet Types admin CRUD. `key` is no longer accepted from the
 * client - it's generated server-side (petTypes.service.ts), same treatment
 * as Service Types, since it was redundant admin-facing busywork alongside
 * the auto-generated `id`. A brand-new row won't have matching
 * category-specific pricing behavior until an admin also configures a
 * fixed-price override for it (the row's Configure action); the plain
 * weight/coat matrix pricing applies otherwise, same fallback Dog already
 * uses today. */
export const createPetTypeValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
  })
  .strict();

export const updatePetTypeValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

/** Custom change: per-branch fixed-price override by pet type
 * (pet_type_price_overrides, 20260912192). branch_id: null upserts the
 * system-wide default row; a uuid upserts that branch's own row. */
export const upsertPetTypePriceOverrideValidator = z
  .object({
    pet_type: z.string().trim().min(1, 'Pet type is required'),
    branch_id: z.uuid().nullable(),
    fixed_price: z.number().nonnegative(),
  })
  .strict();

/** Custom change: Service Types admin CRUD. `key` is no longer accepted
 * from the client - it's generated server-side (serviceTypes.service.ts)
 * since it was redundant admin-facing busywork alongside the auto-generated
 * `id`. */
export const createServiceTypeValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    staff_picker_enabled: z.boolean().optional(),
    cage_picker_enabled: z.boolean().optional(),
    eligible_staff_roles: z.array(z.enum(STAFF_ROLES)).optional(),
    icon: iconField,
    image_url: imageUrlField,
  })
  .strict();

/** Custom change (unify active/available): is_active is derived from branch
 * availability (setServiceTypeBranchAvailability keeps it in sync) and is
 * deliberately not accepted here any more. */
export const updateServiceTypeValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    staff_picker_enabled: z.boolean().optional(),
    cage_picker_enabled: z.boolean().optional(),
    eligible_staff_roles: z.array(z.enum(STAFF_ROLES)).optional(),
    icon: iconField,
    image_url: imageUrlField,
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
export type UpdatePetWeightClassConfigurationInput = z.infer<
  typeof updatePetWeightClassConfigurationValidator
>;
export type UpsertPromoCapConfigurationInput = z.infer<
  typeof upsertPromoCapConfigurationValidator
>;
export type CreatePetTypeInput = z.infer<typeof createPetTypeValidator>;
export type UpdatePetTypeInput = z.infer<typeof updatePetTypeValidator>;
export type UpsertPetTypePriceOverrideInput = z.infer<
  typeof upsertPetTypePriceOverrideValidator
>;
