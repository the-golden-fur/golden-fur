import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  RESCHEDULABLE_BOOKING_STATUSES,
  type Booking,
  type EffectivePolicy,
} from '../booking.types.ts';
import type { RescheduleBookingInput } from '../modules/validators/booking.validator.ts';
import { assertVeterinaryBranchEligibility } from './veterinaryEligibility.service.ts';
import { checkCapacity } from './capacity.service.ts';
import {
  listAvailableStaff,
  resolveEffectivePolicy,
} from './staffPicker.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface NoticeEvaluation {
  /** false when notice_enforcement_enabled is off - check skipped entirely. */
  enforced: boolean;
  met: boolean;
  policy: EffectivePolicy;
}

/**
 * The #54 notice-period stub, read from the policy_configurations stub (#52).
 * Notice is measured against the booking's CURRENT scheduled_start - "how
 * far ahead of the appointment is the customer making this change".
 *
 * Shared by reschedule and cancellation; what each does with an unmet notice
 * differs (see each service).
 */
export async function evaluateNoticePeriod(
  branchId: string,
  scheduledStart: string
): Promise<NoticeEvaluation> {
  const policy = await resolveEffectivePolicy(branchId);

  if (!policy.notice_enforcement_enabled) {
    // AC-4: disabled system-wide allows any reschedule/cancellation
    // regardless of timing.
    return { enforced: false, met: true, policy };
  }

  const noticeMs = policy.notice_period_days * 24 * 60 * 60 * 1000;
  const met = new Date(scheduledStart).getTime() - Date.now() >= noticeMs;

  return { enforced: true, met, policy };
}

export async function loadBookingForChange(
  requesterId: string,
  bookingId: string
): Promise<{ booking: Booking; isStaff: boolean }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Booking not found');

  const booking = data as Booking;

  // AC-6: only the owning customer or an authenticated staff member may
  // change a booking. The server runs on the service-role client, so this
  // application-layer check is the enforcement (RLS additionally scopes
  // direct customer access at the database).
  const staffRole = await getStaffRoleOrNull(requesterId);

  if (!staffRole && booking.customer_id !== requesterId) {
    throwWithStatus(403, 'Forbidden');
  }

  return { booking, isStaff: Boolean(staffRole) };
}

export interface RescheduleResult {
  booking: Booking;
  /** Soft-mode "allowed despite missing notice" flag (#54 AC-3). Not
   * persisted anywhere - cancellation_logs is Sprint 5 scope. */
  policy_violation: boolean;
  notice_period_met: boolean;
}

interface RescheduleParams {
  requesterId: string;
  bookingId: string;
  input: RescheduleBookingInput;
}

/**
 * Issue #54: in-place reschedule on the same bookings row (per the flow
 * diagram) - updates scheduled_start/scheduled_end/assigned_staff_id and
 * increments reschedule_count. No fee calculation exists here by design
 * (Guide dev notes): the reschedule-fee policy columns are Sprint 5 scope,
 * so met-or-Soft reschedules simply proceed without any fee logic.
 */
export async function rescheduleBooking({
  requesterId,
  bookingId,
  input,
}: RescheduleParams): Promise<RescheduleResult> {
  const { booking } = await loadBookingForChange(requesterId, bookingId);

  if (!RESCHEDULABLE_BOOKING_STATUSES.includes(booking.status)) {
    throwWithStatus(409, `A ${booking.status} booking cannot be rescheduled`);
  }

  // A Pending booking whose own appointment time has already passed is
  // effectively a no-show waiting to be lazily flipped on next read (see
  // applyNoShowTransition) - reschedule must not let it slip through in the
  // gap before that read happens.
  if (new Date(booking.scheduled_start).getTime() <= Date.now()) {
    throwWithStatus(
      409,
      'This booking\'s scheduled time has already passed and cannot be rescheduled'
    );
  }

  const targetBranchId = input.branch_id ?? booking.branch_id;

  // #53 AC-4: a reschedule that changes branch on a Veterinary booking runs
  // the same guard as creation (no-op for other categories).
  await assertVeterinaryBranchEligibility({
    branchId: targetBranchId,
    serviceCategory: booking.service_category,
  });

  const notice = await evaluateNoticePeriod(
    booking.branch_id,
    booking.scheduled_start
  );

  if (notice.enforced && !notice.met) {
    if (notice.policy.notice_enforcement_mode === 'Strict') {
      // AC-2: Strict blocks outright, naming the required notice period.
      throwWithStatus(
        422,
        `Reschedule requires at least ${notice.policy.notice_period_days} day(s) notice before the appointment`
      );
    }
    // Soft: allowed, flagged below (AC-3).
  }

  const policyViolation = notice.enforced && !notice.met;

  // Capacity re-check for the new slot (Guide dev notes), excluding this
  // booking so it never collides with itself.
  let assignedStaffId = booking.assigned_staff_id;

  if (
    booking.service_category === 'Grooming' ||
    booking.service_category === 'Veterinary'
  ) {
    const baseParams = {
      branchId: targetBranchId,
      serviceCategory: booking.service_category,
      scheduledStart: input.scheduled_start,
      scheduledEnd: input.scheduled_end,
      excludeBookingId: booking.id,
    };

    if (input.staff_preference?.type === 'specific') {
      const verified = await listAvailableStaff({
        ...baseParams,
        staffId: input.staff_preference.staff_id,
      });

      if (verified.length === 0) {
        throwWithStatus(
          409,
          'The selected staff member is not available for the new time'
        );
      }

      assignedStaffId = input.staff_preference.staff_id!;
    } else {
      // Keep the currently assigned staff member when they're still
      // eligible for the new window; otherwise fall back to the next
      // available one ("No preference" semantics).
      const eligible = await listAvailableStaff(baseParams);

      if (eligible.length === 0) {
        throwWithStatus(
          409,
          'No eligible staff available for the new time — please select another slot'
        );
      }

      const current = eligible.find(
        (member) => member.staff_id === booking.assigned_staff_id
      );

      assignedStaffId = (current ?? eligible[0]).staff_id;
    }
  } else {
    const { data: pet, error: petError } = await supabase
      .from('pets')
      .select('weight_class')
      .eq('id', booking.pet_id)
      .maybeSingle();

    if (petError) throwWithStatus(400, petError.message);
    if (!pet) throwWithStatus(404, 'Pet not found');

    const capacity = await checkCapacity({
      branchId: targetBranchId,
      serviceCategory: booking.service_category,
      scheduledStart: input.scheduled_start,
      scheduledEnd: input.scheduled_end,
      petWeightClass: pet.weight_class as 'S' | 'M' | 'L' | 'XL',
      excludeBookingId: booking.id,
    });

    if (!capacity.available) {
      throwWithStatus(409, capacity.reason ?? 'No capacity for the new slot');
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      branch_id: targetBranchId,
      assigned_staff_id: assignedStaffId,
      reschedule_count: booking.reschedule_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(400, updateError?.message ?? 'Failed to reschedule');
  }

  return {
    booking: updated as Booking,
    policy_violation: policyViolation,
    notice_period_met: notice.met,
  };
}
