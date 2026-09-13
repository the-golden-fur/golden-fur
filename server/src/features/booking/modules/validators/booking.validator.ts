import { z } from 'zod';
import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  FOOD_QUANTITY_UNITS,
  MEDICATION_DOSE_UNITS,
  OVERRIDABLE_BOOKING_STATUSES,
  PAYMENT_SCHEMES,
  PAYMENT_STATUSES,
} from '../../booking.types.ts';

const CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Assessment',
] as const;
const ENFORCEMENT_MODES = ['Strict', 'Soft'] as const;
const RESCHEDULE_FEE_TYPES = ['Flat', 'Percentage'] as const;
const DOWNPAYMENT_TYPES = ['Flat', 'Percentage'] as const;
const CREDIT_EXPIRY_MODES = ['none', 'rolling', 'fixed_date'] as const;
const CREDIT_REVIEW_MODES = ['Automatic', 'Manual'] as const;
const CREDIT_REVIEW_DECISIONS = ['approved', 'denied'] as const;
/** Which notice-period floor the availability endpoints apply. */
const BOOKING_INTENTS = ['new_booking', 'reschedule'] as const;

/** "YYYY-MM-DD" - the shape an <input type="date"> submits and a Postgres
 * `date` column accepts. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEIGHT_CLASSES = ['S', 'M', 'L', 'XL'] as const;
/** Matches branches.validator.ts's TIME_PATTERN - "HH:MM" 24h. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** ISO-8601 with offset, matching the timestamptz columns. */
const isoDatetime = z.iso.datetime({ offset: true });

export const staffPreferenceValidator = z
  .object({
    type: z.enum(['no_preference', 'specific']),
    staff_id: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.type === 'specific' && !input.staff_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['staff_id'],
        message: 'staff_id is required when preference type is "specific"',
      });
    }

    if (input.type === 'no_preference' && input.staff_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['staff_id'],
        message: 'staff_id must be omitted for "no_preference"',
      });
    }
  });

/** Custom change: Cage Picker addendum - mirrors staffPreferenceValidator. */
export const cagePreferenceValidator = z
  .object({
    type: z.enum(['no_preference', 'specific']),
    cage_id: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.type === 'specific' && !input.cage_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['cage_id'],
        message: 'cage_id is required when preference type is "specific"',
      });
    }

    if (input.type === 'no_preference' && input.cage_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['cage_id'],
        message: 'cage_id must be omitted for "no_preference"',
      });
    }
  });

/** Each selected item is exactly one of a service or a package (mirrors
 * booking_items' own CHECK constraint), and a booking must select at least
 * one item overall - multi-item bookings revision, replacing the old
 * exactly-one-of-service_id/package_id-on-the-booking-itself rule. */
const bookingItemValidator = z.union([
  z.object({ service_id: z.uuid() }).strict(),
  z.object({ package_id: z.uuid() }).strict(),
]);

function requireNoDuplicateItems(
  input: { items: Array<{ service_id: string } | { package_id: string }> },
  ctx: z.RefinementCtx
) {
  const serviceIds = input.items
    .filter((item): item is { service_id: string } => 'service_id' in item)
    .map((item) => item.service_id);
  const packageIds = input.items
    .filter((item): item is { package_id: string } => 'package_id' in item)
    .map((item) => item.package_id);

  if (
    new Set(serviceIds).size !== serviceIds.length ||
    new Set(packageIds).size !== packageIds.length
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Duplicate services or packages are not allowed in one booking',
    });
  }
}

function requireEndAfterStart(
  input: { scheduled_start: string; scheduled_end: string },
  ctx: z.RefinementCtx
) {
  if (new Date(input.scheduled_end) <= new Date(input.scheduled_start)) {
    ctx.addIssue({
      code: 'custom',
      path: ['scheduled_end'],
      message: 'scheduled_end must be after scheduled_start',
    });
  }
}

const hotelPartOfDay = z.enum(['Morning', 'Afternoon', 'Evening']);
// Feeding's meal_time gets a "Noon" option that walking/playing's time_block
// does not - a separate enum, not a widened hotelPartOfDay, keeps those two
// unaffected.
const hotelMealTime = z.enum(['Morning', 'Noon', 'Afternoon', 'Evening']);
const foodQuantityUnit = z.enum(FOOD_QUANTITY_UNITS);
const medicationDoseUnit = z.enum(MEDICATION_DOSE_UNITS);

/**
 * Booking-time preferences for a Hotel booking - a preview the check-in form
 * pre-fills from, never the authoritative record (the receptionist still
 * confirms/edits everything at physical check-in). food_catalog_id/
 * medication_catalog_id are optional and only populated by a booking flow's
 * catalog-aware Care Instructions step - without them, HotelCheckInPage
 * falls back to its older freetext-only prefill behavior. stay_date is
 * optional/omittable on every row: omitted means the row applies to every
 * night of the stay (uniform_instructions = true), a date scopes it to that
 * single night (#22 per-night care instructions).
 */
const hotelPreferencesValidator = z
  .object({
    uniform_instructions: z.boolean().default(true),
    feeding: z
      .array(
        z
          .object({
            meal_time: hotelMealTime,
            food_type: z.string().trim().min(1),
            quantity: z.string().trim().min(1),
            quantity_unit: foodQuantityUnit,
            photo_url: z.url().optional(),
            special_instructions: z.string().trim().optional(),
            food_catalog_id: z.uuid().optional(),
            stay_date: z.iso.date().optional(),
          })
          .strict()
      )
      .default([]),
    walking: z
      .array(
        z
          .object({
            time_block: hotelPartOfDay,
            duration_minutes: z.number().int().positive(),
            notes: z.string().trim().optional(),
            stay_date: z.iso.date().optional(),
          })
          .strict()
      )
      .default([]),
    playing: z
      .array(
        z
          .object({
            time_block: hotelPartOfDay,
            duration_minutes: z.number().int().positive(),
            notes: z.string().trim().optional(),
            stay_date: z.iso.date().optional(),
          })
          .strict()
      )
      .default([]),
    medications: z
      .array(
        z
          .object({
            medication_name: z.string().trim().min(1),
            dose: z.string().trim().min(1),
            dose_unit: medicationDoseUnit,
            photo_url: z.url().optional(),
            scheduled_times: z.array(z.string().min(1)).default([]),
            administration_notes: z.string().trim().optional(),
            medication_catalog_id: z.uuid().optional(),
            stay_date: z.iso.date().optional(),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

export const createBookingValidator = z
  .object({
    // Required when a staff member books on behalf of a walk-in/phone-in
    // customer; forbidden to differ from the requester for customer callers
    // (enforced in booking.service.ts, where the requester's role is known).
    customer_id: z.uuid().optional(),
    pet_id: z.uuid(),
    branch_id: z.uuid(),
    service_category: z.enum(CATEGORIES),
    // Walk-in booking flow - defaults to 'Online' when omitted (unchanged
    // behavior for every existing caller). 'Walk-in' is staff-only, same
    // pattern as customer_id below; enforced in booking.service.ts where the
    // requester's role is known.
    booking_source: z.enum(BOOKING_SOURCES).optional(),
    items: z
      .array(bookingItemValidator)
      .min(1, 'At least one service or package must be selected'),
    scheduled_start: isoDatetime,
    scheduled_end: isoDatetime,
    staff_preference: staffPreferenceValidator.optional(),
    cage_preference: cagePreferenceValidator.optional(),
    // Payment model rework: no payment method / confirmed flag at booking
    // time - only the scheme (how the initial charge transaction is sized).
    // 'downpayment' only matters when the branch down-payment policy is on;
    // otherwise it's a single full-net-total charge. See createBooking.
    payment_scheme: z.enum(PAYMENT_SCHEMES).optional(),
    special_instructions: z.string().trim().min(1).optional(),
    hotel_preferences: hotelPreferencesValidator.optional(),
    // Role (money-handling staff only) and Cash-only enforcement happen in
    // booking.service.ts, where the requester's staff role is known - the
    // validator only shapes the field.
    discount_id: z.uuid().optional(),
    // Open to customers too (no role gate) - a promo is a self-service
    // discount, unlike a discount row which needs staff to verify an ID.
    promo_id: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    requireNoDuplicateItems(input, ctx);
    requireEndAfterStart(input, ctx);

    // Custom change (Daycare/Hotel parity follow-up): Daycare's Care
    // Instructions booking-time step now sends the same
    // feeding/walking/playing/medications shape Hotel does, reusing this
    // field/column rather than adding a parallel one - the data is
    // category-agnostic care instructions, not literally Hotel-specific.
    if (
      input.hotel_preferences &&
      input.service_category !== 'Hotel' &&
      input.service_category !== 'Daycare'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['hotel_preferences'],
        message:
          'hotel_preferences is only valid for Hotel or Daycare bookings',
      });
    }
  });

/**
 * Multi-booking checkout (bookingGroup.service.ts): several independent
 * sub-bookings created together, sharing ONE payment. Each sub-booking's
 * shape mirrors createBookingValidator's own per-booking fields exactly
 * (reusing the same bookingItemValidator/staffPreferenceValidator/
 * cagePreferenceValidator/hotelPreferencesValidator pieces and the same
 * duplicate-item/end-after-start checks) except customer_id (resolved once,
 * group-wide) and discount_id/promo_id/payment_scheme, which move UP to the
 * group level since a discount/promo/payment scheme applies once across the
 * whole checkout, not per sub-booking.
 */
const bookingGroupItemValidator = z
  .object({
    pet_id: z.uuid(),
    service_category: z.enum(CATEGORIES),
    booking_source: z.enum(BOOKING_SOURCES).optional(),
    items: z
      .array(bookingItemValidator)
      .min(1, 'At least one service or package must be selected'),
    scheduled_start: isoDatetime,
    scheduled_end: isoDatetime,
    staff_preference: staffPreferenceValidator.optional(),
    cage_preference: cagePreferenceValidator.optional(),
    special_instructions: z.string().trim().min(1).optional(),
    hotel_preferences: hotelPreferencesValidator.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    requireNoDuplicateItems(input, ctx);
    requireEndAfterStart(input, ctx);

    if (
      input.hotel_preferences &&
      input.service_category !== 'Hotel' &&
      input.service_category !== 'Daycare'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['hotel_preferences'],
        message:
          'hotel_preferences is only valid for Hotel or Daycare bookings',
      });
    }
  });

export const createBookingGroupValidator = z
  .object({
    // Required when a staff member books on behalf of a walk-in/phone-in
    // customer - same rule as createBookingValidator's own customer_id,
    // enforced in bookingGroup.service.ts where the requester's role is
    // known.
    customer_id: z.uuid().optional(),
    branch_id: z.uuid(),
    bookings: z
      .array(bookingGroupItemValidator)
      .min(1, 'At least one booking is required'),
    // Shared, group-level: one discount/promo/payment scheme applies to the
    // combined net total across every sub-booking, not per sub-booking - see
    // resolveDiscountAndPromo's group-scoped call in
    // bookingGroup.service.ts.
    payment_scheme: z.enum(PAYMENT_SCHEMES).optional(),
    discount_id: z.uuid().optional(),
    promo_id: z.uuid().optional(),
  })
  .strict();

export const rescheduleBookingValidator = z
  .object({
    scheduled_start: isoDatetime,
    scheduled_end: isoDatetime,
    // A reschedule may move branches; #53's guard re-checks Veterinary
    // eligibility when it does.
    branch_id: z.uuid().optional(),
    staff_preference: staffPreferenceValidator.optional(),
    // Slot-conflict notification (20260911188): a Hotel booking flagged with
    // a cage-size conflict needs a way to change its cage preference too,
    // not just date/time/staff - previously only createBookingValidator
    // accepted this field. Omitted = keep the booking's current
    // preferred_cage_id as-is (mirrors staff_preference's own
    // omitted-means-unchanged-then-re-verified behavior in
    // reschedule.service.ts).
    cage_preference: cagePreferenceValidator.optional(),
  })
  .strict()
  .superRefine(requireEndAfterStart);

export const cancelBookingValidator = z
  .object({
    cancellation_reason: z.string().trim().min(1).optional(),
  })
  .strict();

/** Staff-only "extend stay" action (extend-hotel-stay custom change) - a
 * whole-nights add-on to a Hotel booking's current scheduled_end. The upper
 * bound is just a sanity ceiling against a fat-fingered input, not a real
 * product limit on stay length. */
export const extendHotelStayValidator = z
  .object({
    additional_nights: z.number().int().min(1).max(90),
  })
  .strict();

/** Manual-cancellation-credit-review custom change: a staff member's
 * approve/deny decision on a pending cancellation_logs row. */
export const decideCreditReviewValidator = z
  .object({
    decision: z.enum(CREDIT_REVIEW_DECISIONS),
  })
  .strict();

/** Customer self-service Pay button (CustomerBookingsPage). */
export const payBookingValidator = z
  .object({
    payment_method: z.enum(['GCash', 'Maya']),
    pay_in_full: z.boolean(),
  })
  .strict();

/** Customer-chosen partial payment toward a partly-paid booking's balance. */
export const addBalancePaymentValidator = z
  .object({
    amount: z.number().positive(),
  })
  .strict();

export const onlinePaymentsStatusQueryValidator = z.object({
  branch_id: z.uuid(),
});

/** Custom change: per-transaction downpayment config, read by the customer
 * booking flow the same way onlinePaymentsStatusQueryValidator's endpoint
 * exposes online_payments_enabled. */
export const downpaymentStatusQueryValidator = z.object({
  branch_id: z.uuid(),
});

/** Custom change: duplicate-booking prevention - which pets have an
 * unresolved Hotel/Daycare booking. */
export const petBookingConflictsQueryValidator = z.object({
  customer_id: z.uuid(),
});

export const updatePolicyValidator = z
  .object({
    // null/omitted targets the system-wide default row; a uuid targets (or
    // creates) that branch's override row (#52 AC-2).
    branch_id: z.uuid().nullable().optional(),
    notice_period_days: z.number().int().min(0).optional(),
    notice_enforcement_mode: z.enum(ENFORCEMENT_MODES).optional(),
    notice_enforcement_enabled: z.boolean().optional(),
    booking_notice_period_days: z.number().int().min(0).optional(),
    lunch_break_enabled: z.boolean().optional(),
    lunch_break_start: z
      .string()
      .regex(TIME_PATTERN, 'Use HH:MM (24h)')
      .optional(),
    lunch_break_end: z
      .string()
      .regex(TIME_PATTERN, 'Use HH:MM (24h)')
      .optional(),
    reschedule_fee_enabled: z.boolean().optional(),
    reschedule_fee_type: z.enum(RESCHEDULE_FEE_TYPES).nullable().optional(),
    reschedule_fee_value: z.number().min(0).nullable().optional(),
    // NULL = unlimited free reschedules (documented default).
    reschedule_free_allowance: z.number().int().min(0).nullable().optional(),
    // Mutually-exclusive expiry mode (20260902159), replacing the old
    // credit_expiry_enabled boolean. credit_expiry_fixed_date is required
    // with 'fixed_date' and must be absent/null otherwise - enforced in the
    // superRefine below, mirroring the reschedule_fee_type/value pairing.
    credit_expiry_mode: z.enum(CREDIT_EXPIRY_MODES).optional(),
    credit_expiry_days: z.number().int().min(1).optional(),
    credit_expiry_fixed_date: z
      .string()
      .regex(DATE_PATTERN, 'Use YYYY-MM-DD')
      .nullable()
      .optional(),
    // Advisor addendum #10: percent of the paid amount returned as credit on
    // a qualifying cancellation. NOT NULL in the DB (default 100), 0-100.
    cancellation_credit_conversion_rate: z.number().min(0).max(100).optional(),
    online_payments_enabled: z.boolean().optional(),
    downpayment_enabled: z.boolean().optional(),
    downpayment_type: z.enum(DOWNPAYMENT_TYPES).nullable().optional(),
    downpayment_amount: z.number().positive().nullable().optional(),
    // Down-payment slot gate (20260829146): hours from creation before an
    // unpaid down-payment-required Online booking auto-cancels. NOT NULL in
    // the DB (default 24), so no null here - just a positive integer.
    downpayment_hold_hours: z.number().int().positive().optional(),
    // Staff concurrency (20260908178): overlapping bookings one staff member
    // may hold. NOT NULL in the DB (default 1, CHECK >= 1).
    max_concurrent_bookings_per_staff: z.number().int().min(1).optional(),
    // Transactional-email behaviour (20260908181). All NOT NULL in the DB
    // with documented defaults - just booleans + the two-value mode enum.
    booking_group_email_mode: z.enum(['combined', 'per_booking']).optional(),
    care_log_task_email_enabled: z.boolean().optional(),
    care_log_daily_report_enabled: z.boolean().optional(),
    // Manual-cancellation-credit-review custom change.
    credit_review_mode: z.enum(CREDIT_REVIEW_MODES).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const { branch_id: _branchId, ...settings } = input;

    if (Object.values(settings).every((value) => value === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one policy setting must be provided',
      });
    }

    if (
      input.lunch_break_start &&
      input.lunch_break_end &&
      input.lunch_break_start >= input.lunch_break_end
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'lunch_break_end must be after lunch_break_start',
        path: ['lunch_break_end'],
      });
    }

    if (
      (input.reschedule_fee_type !== undefined) !==
      (input.reschedule_fee_value !== undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'reschedule_fee_type and reschedule_fee_value must be provided together',
        path: ['reschedule_fee_value'],
      });
    }

    if (
      input.reschedule_fee_type === 'Percentage' &&
      input.reschedule_fee_value != null &&
      input.reschedule_fee_value > 100
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'A percentage reschedule fee cannot exceed 100',
        path: ['reschedule_fee_value'],
      });
    }

    // Custom change: mirrors reschedule_fee_type/value's own pairing rule
    // above - downpayment_type and downpayment_amount are only meaningful
    // together, and a 'Percentage' amount is capped at 100.
    if (
      (input.downpayment_type !== undefined) !==
      (input.downpayment_amount !== undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'downpayment_type and downpayment_amount must be provided together',
        path: ['downpayment_amount'],
      });
    }

    if (
      input.downpayment_type === 'Percentage' &&
      input.downpayment_amount != null &&
      input.downpayment_amount > 100
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'A percentage downpayment cannot exceed 100',
        path: ['downpayment_amount'],
      });
    }

    // Credit expiry: the fixed date and the 'fixed_date' mode go together and
    // nowhere else ("only one or the other" - the branch-wide fixed date XOR
    // the rolling day count).
    if (
      input.credit_expiry_mode === 'fixed_date' &&
      input.credit_expiry_fixed_date == null
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          "credit_expiry_fixed_date is required when credit_expiry_mode is 'fixed_date'",
        path: ['credit_expiry_fixed_date'],
      });
    }

    if (
      input.credit_expiry_fixed_date != null &&
      input.credit_expiry_mode !== 'fixed_date'
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          "credit_expiry_fixed_date is only valid when credit_expiry_mode is 'fixed_date'",
        path: ['credit_expiry_fixed_date'],
      });
    }
  });

export const staffPickerQueryValidator = z.object({
  branch_id: z.uuid(),
  service_category: z.enum(CATEGORIES),
  scheduled_start: isoDatetime,
  scheduled_end: isoDatetime,
});

/** Custom change: Cage Picker addendum - branch-only, unlike the staff
 * picker's time-window query, since cage availability is a live status
 * snapshot (Available/Occupied/Reserved/Under Maintenance) rather than a
 * time-window overlap check - see cagePicker.service.ts.
 *
 * pet_id (Custom change, cage pet-type support): required so the options
 * list can be hard-filtered to the pet's own pet_type. */
export const cagePickerQueryValidator = z.object({
  branch_id: z.uuid(),
  pet_id: z.uuid(),
});

/** Custom change (cage pet-type support / customer readonly cage view). */
export const cageAssignmentStatusQueryValidator = z.object({
  branch_id: z.uuid(),
  pet_id: z.uuid(),
});

/**
 * #56/#60 supporting infra: neither the Slot Picker UI nor the Receptionist
 * Bookings Queue had a read endpoint to call against in the merged #51/#52
 * backend. slot_duration_minutes is supplied by the client from the already-
 * selected service's duration_minutes (step 3 precedes the Slot Picker, step
 * 4, in the flow) rather than looked up server-side, keeping this endpoint a
 * thin capacity-by-slot read.
 */
export const availabilityQueryValidator = z
  .object({
    branch_id: z.uuid(),
    service_category: z.enum(CATEGORIES),
    date: z.iso.date(),
    // Up to 1440 (24h) - Hotel's seeded service duration is a full night
    // (M13 seed data), unlike Grooming/Veterinary/Daycare's within-a-day
    // appointment lengths.
    slot_duration_minutes: z.coerce.number().int().min(15).max(1440),
    pet_weight_class: z.enum(WEIGHT_CLASSES).optional(),
    // Which notice-period floor applies: a new booking uses
    // booking_notice_period_days (default 0); a reschedule keeps
    // notice_period_days (default 3). Omitted = new_booking.
    intent: z.enum(BOOKING_INTENTS).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.service_category === 'Hotel' && !input.pet_weight_class) {
      ctx.addIssue({
        code: 'custom',
        path: ['pet_weight_class'],
        message: 'pet_weight_class is required for Hotel availability',
      });
    }
  });

/**
 * #22: which Morning/Afternoon/Evening walk/play blocks the hotel Care
 * Instructions step should offer for a given branch/date.
 */
export const partsOfDayQueryValidator = z
  .object({
    branch_id: z.uuid(),
    date: z.iso.date(),
  })
  .strict();

export const catalogQueryValidator = z.object({
  branch_id: z.uuid(),
  category: z.enum(CATEGORIES).optional(),
  // Pet Types admin CRUD + fixed-price override (20260912191/20260912192):
  // when given, the catalog also resolves this pet type's fixed-price
  // override for branch_id, so the customer-facing price preview can show
  // the real charged price instead of every item's own base_price/
  // bundled_price.
  pet_type: z.string().trim().min(1).optional(),
});

export const listBookingsQueryValidator = z.object({
  branch_id: z.uuid().optional(),
  date: z.iso.date().optional(),
  // Inclusive date-range bounds, either may be given alone. Distinct from
  // `date` (kept for existing exact-day callers, e.g. Daycare Check-in).
  date_from: z.iso.date().optional(),
  date_to: z.iso.date().optional(),
  service_category: z.enum(CATEGORIES).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  // Bookings/Transactions paid/unpaid filter - the booking's payment_status rollup.
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  // Bookings Queue's "assigned to me / no preference" filter - a staff
  // UUID, or the sentinel 'unassigned' for assigned_staff_id IS NULL.
  assigned_staff_id: z.union([z.uuid(), z.literal('unassigned')]).optional(),
  // Custom change (P-1 roadmap item: generic downpayment) - opt-in, see
  // ListBookingsFilters.excludeUnpaidDownpayment in booking.service.ts.
  exclude_unpaid_downpayment: z.coerce.boolean().optional(),
});

/** Admin/Superadmin-only direct status set (forward or backward) - see
 * BOOKING_STATUS_OVERRIDE_ROLES/overrideBookingStatus in booking.service.ts. */
export const overrideBookingStatusValidator = z
  .object({
    status: z.enum(OVERRIDABLE_BOOKING_STATUSES),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingValidator>;
export type CreateBookingGroupInput = z.infer<
  typeof createBookingGroupValidator
>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingValidator>;
export type ExtendHotelStayInput = z.infer<typeof extendHotelStayValidator>;
export type DecideCreditReviewInput = z.infer<
  typeof decideCreditReviewValidator
>;
export type CancelBookingInput = z.infer<typeof cancelBookingValidator>;
export type UpdatePolicyInput = z.infer<typeof updatePolicyValidator>;
export type PayBookingInput = z.infer<typeof payBookingValidator>;
export type OnlinePaymentsStatusQueryInput = z.infer<
  typeof onlinePaymentsStatusQueryValidator
>;
export type DownpaymentStatusQueryInput = z.infer<
  typeof downpaymentStatusQueryValidator
>;
export type PetBookingConflictsQueryInput = z.infer<
  typeof petBookingConflictsQueryValidator
>;
export type StaffPickerQueryInput = z.infer<typeof staffPickerQueryValidator>;
export type CagePickerQueryInput = z.infer<typeof cagePickerQueryValidator>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQueryValidator>;
export type CatalogQueryInput = z.infer<typeof catalogQueryValidator>;
export type ListBookingsQueryInput = z.infer<typeof listBookingsQueryValidator>;
export type OverrideBookingStatusInput = z.infer<
  typeof overrideBookingStatusValidator
>;
