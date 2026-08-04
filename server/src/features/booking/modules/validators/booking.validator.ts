import { z } from 'zod';
import {
  BOOKING_STATUSES,
  OVERRIDABLE_BOOKING_STATUSES,
  OVERRIDABLE_PAYMENT_STAGES,
  PAYMENT_METHODS,
} from '../../booking.types.ts';

const CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
] as const;
const ENFORCEMENT_MODES = ['Strict', 'Soft'] as const;
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
    items: z
      .array(bookingItemValidator)
      .min(1, 'At least one service or package must be selected'),
    scheduled_start: isoDatetime,
    scheduled_end: isoDatetime,
    staff_preference: staffPreferenceValidator.optional(),
    payment_method: z.enum(PAYMENT_METHODS).optional(),
    payment_confirmed: z.boolean().optional(),
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

    if (input.hotel_preferences && input.service_category !== 'Hotel') {
      ctx.addIssue({
        code: 'custom',
        path: ['hotel_preferences'],
        message: 'hotel_preferences is only valid for Hotel bookings',
      });
    }
  });

export const rescheduleBookingValidator = z
  .object({
    scheduled_start: isoDatetime,
    scheduled_end: isoDatetime,
    // A reschedule may move branches; #53's guard re-checks Veterinary
    // eligibility when it does.
    branch_id: z.uuid().optional(),
    staff_preference: staffPreferenceValidator.optional(),
  })
  .strict()
  .superRefine(requireEndAfterStart);

export const cancelBookingValidator = z
  .object({
    cancellation_reason: z.string().trim().min(1).optional(),
  })
  .strict();

export const updatePolicyValidator = z
  .object({
    // null/omitted targets the system-wide default row; a uuid targets (or
    // creates) that branch's override row (#52 AC-2).
    branch_id: z.uuid().nullable().optional(),
    notice_period_days: z.number().int().min(0).optional(),
    notice_enforcement_mode: z.enum(ENFORCEMENT_MODES).optional(),
    notice_enforcement_enabled: z.boolean().optional(),
    staff_picker_enabled_grooming: z.boolean().optional(),
    staff_picker_enabled_veterinary: z.boolean().optional(),
    lunch_break_enabled: z.boolean().optional(),
    lunch_break_start: z
      .string()
      .regex(TIME_PATTERN, 'Use HH:MM (24h)')
      .optional(),
    lunch_break_end: z
      .string()
      .regex(TIME_PATTERN, 'Use HH:MM (24h)')
      .optional(),
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
  });

export const staffPickerQueryValidator = z.object({
  branch_id: z.uuid(),
  service_category: z.enum(CATEGORIES),
  scheduled_start: isoDatetime,
  scheduled_end: isoDatetime,
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

/**
 * #22: powers the "fully booked" warning shown right after the customer
 * picks a service, before they ever reach the Slot Picker - same shape as
 * availabilityQueryValidator, just `date` -> `from_date` (the search start,
 * not a single day to inspect) plus an optional lookahead window.
 */
export const nextAvailableSlotQueryValidator = z
  .object({
    branch_id: z.uuid(),
    service_category: z.enum(CATEGORIES),
    from_date: z.iso.date(),
    slot_duration_minutes: z.coerce.number().int().min(15).max(1440),
    pet_weight_class: z.enum(WEIGHT_CLASSES).optional(),
    lookahead_days: z.coerce.number().int().min(1).max(60).optional(),
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

export const catalogQueryValidator = z.object({
  branch_id: z.uuid(),
  category: z.enum(CATEGORIES).optional(),
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
  // Bookings Queue's "assigned to me / no preference" filter - a staff
  // UUID, or the sentinel 'unassigned' for assigned_staff_id IS NULL.
  assigned_staff_id: z.union([z.uuid(), z.literal('unassigned')]).optional(),
});

/** Admin/Superadmin-only direct status set (forward or backward) - see
 * BOOKING_STATUS_OVERRIDE_ROLES/overrideBookingStatus in booking.service.ts. */
export const overrideBookingStatusValidator = z
  .object({
    status: z.enum(OVERRIDABLE_BOOKING_STATUSES),
  })
  .strict();

/** "Advance" action for payment_stage - `choice` is required only when the
 * booking is currently Unpaid (advancePaymentStage in booking.service.ts
 * enforces that, since it depends on the booking's current stage, not
 * something this shape-only validator can express). */
export const advancePaymentStageValidator = z
  .object({
    choice: z.enum(['advance', 'onsite']).optional(),
  })
  .strict();

/** Admin/Superadmin-only direct payment_stage set (forward or backward) -
 * see BOOKING_STATUS_OVERRIDE_ROLES/overridePaymentStage in
 * booking.service.ts. */
export const overridePaymentStageValidator = z
  .object({
    payment_stage: z.enum(OVERRIDABLE_PAYMENT_STAGES),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingValidator>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingValidator>;
export type CancelBookingInput = z.infer<typeof cancelBookingValidator>;
export type UpdatePolicyInput = z.infer<typeof updatePolicyValidator>;
export type StaffPickerQueryInput = z.infer<typeof staffPickerQueryValidator>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQueryValidator>;
export type CatalogQueryInput = z.infer<typeof catalogQueryValidator>;
export type ListBookingsQueryInput = z.infer<typeof listBookingsQueryValidator>;
export type OverrideBookingStatusInput = z.infer<
  typeof overrideBookingStatusValidator
>;
export type AdvancePaymentStageInput = z.infer<
  typeof advancePaymentStageValidator
>;
export type OverridePaymentStageInput = z.infer<
  typeof overridePaymentStageValidator
>;
