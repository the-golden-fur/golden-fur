import { z } from 'zod';
import { PAYMENT_METHODS } from '../../booking.types.ts';

const CATEGORIES = ['Grooming', 'Hotel', 'Daycare', 'Veterinary'] as const;
const ENFORCEMENT_MODES = ['Strict', 'Soft'] as const;

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

export type CreateBookingInput = z.infer<typeof createBookingValidator>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingValidator>;
export type CancelBookingInput = z.infer<typeof cancelBookingValidator>;
export type UpdatePolicyInput = z.infer<typeof updatePolicyValidator>;
export type StaffPickerQueryInput = z.infer<typeof staffPickerQueryValidator>;
