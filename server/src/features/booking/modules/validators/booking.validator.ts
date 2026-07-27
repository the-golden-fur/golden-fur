import { z } from 'zod';
import { PAYMENT_METHODS } from '../../booking.types.ts';

const CATEGORIES = ['Grooming', 'Hotel', 'Daycare', 'Veterinary'] as const;
const ENFORCEMENT_MODES = ['Strict', 'Soft'] as const;
const WEIGHT_CLASSES = ['S', 'M', 'L', 'XL'] as const;
const BOOKING_STATUSES = [
  'Confirmed',
  'Completed',
  'Cancelled',
  'No-show',
  'Pending',
] as const;

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

function requireExactlyOneTarget(
  input: { service_id?: string; package_id?: string },
  ctx: z.RefinementCtx
) {
  // Exactly one of service_id/package_id (#50 AC-4) - same rule the bookings
  // CHECK constraint enforces in SQL; rejected here first for a clear 400.
  if (Boolean(input.service_id) === Boolean(input.package_id)) {
    ctx.addIssue({
      code: 'custom',
      path: ['service_id'],
      message: 'Exactly one of service_id or package_id must be provided',
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

export const createBookingValidator = z
  .object({
    // Required when a staff member books on behalf of a walk-in/phone-in
    // customer; forbidden to differ from the requester for customer callers
    // (enforced in booking.service.ts, where the requester's role is known).
    customer_id: z.uuid().optional(),
    pet_id: z.uuid(),
    branch_id: z.uuid(),
    service_category: z.enum(CATEGORIES),
    service_id: z.uuid().optional(),
    package_id: z.uuid().optional(),
    scheduled_start: isoDatetime,
    scheduled_end: isoDatetime,
    addon_service_ids: z.array(z.uuid()).optional(),
    staff_preference: staffPreferenceValidator.optional(),
    payment_method: z.enum(PAYMENT_METHODS).optional(),
    payment_confirmed: z.boolean().optional(),
    special_instructions: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    requireExactlyOneTarget(input, ctx);
    requireEndAfterStart(input, ctx);
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
});

export type CreateBookingInput = z.infer<typeof createBookingValidator>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingValidator>;
export type CancelBookingInput = z.infer<typeof cancelBookingValidator>;
export type UpdatePolicyInput = z.infer<typeof updatePolicyValidator>;
export type StaffPickerQueryInput = z.infer<typeof staffPickerQueryValidator>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQueryValidator>;
export type CatalogQueryInput = z.infer<typeof catalogQueryValidator>;
export type ListBookingsQueryInput = z.infer<typeof listBookingsQueryValidator>;
