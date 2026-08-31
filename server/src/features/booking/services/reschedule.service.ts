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
  assertMeetsNoticeLeadTime,
  listAvailableStaff,
  pickRandomAvailableStaff,
  resolveEffectivePolicy,
} from './staffPicker.service.ts';
import { writeCancellationLog } from './cancellationLog.service.ts';
import { calculateRescheduleFee } from './rescheduleFee.service.ts';
import { sendBookingRescheduledNotification } from './bookingNotifications.service.ts';

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
      "This booking's scheduled time has already passed and cannot be rescheduled"
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

  // Minimum-notice lead time (advisor addendum): the NEW slot must itself be
  // at least notice_period_days out, mirroring createBooking. This is the
  // date-range floor the reschedule Slot Picker also applies; distinct from
  // the evaluateNoticePeriod check below, which asks how far ahead of the
  // CURRENT appointment the customer is making the change. Reuses the policy
  // evaluateNoticePeriod already resolved - no extra query.
  assertMeetsNoticeLeadTime(notice.policy, input.scheduled_start, 'Reschedule');

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
      // eligible for the new window; otherwise fall back to a random
      // eligible one ("No preference" semantics - see autoAssignStaff's own
      // dev note on why this isn't the RPC's display_name ordering).
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

      assignedStaffId = (current ?? pickRandomAvailableStaff(eligible)!)
        .staff_id;
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

  // #92: calculated against the PRE-reschedule reschedule_count/total_price
  // - a pure read of state already in hand, no extra query. NULL (no fee)
  // overwrites any earlier pending amount, matching a fresh reschedule
  // superseding whatever was pending from a previous one.
  const feeAmount = calculateRescheduleFee({ policy: notice.policy, booking });

  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      branch_id: targetBranchId,
      assigned_staff_id: assignedStaffId,
      reschedule_count: booking.reschedule_count + 1,
      pending_reschedule_fee_amount: feeAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(400, updateError?.message ?? 'Failed to reschedule');
  }

  // #91: every completed reschedule writes a log row too, not just
  // cancellations - a Strict-blocked attempt above never reaches this line,
  // since it never actually happened.
  await writeCancellationLog({
    bookingId: booking.id,
    customerId: booking.customer_id,
    branchId: targetBranchId,
    eventType: 'reschedule',
    noticePeriodMet: notice.met,
    enforcementModeApplied: notice.policy.notice_enforcement_mode,
    policyViolation,
    rescheduleFeeCharged: feeAmount,
  });

  // Issue #98: no stub existed for this event - net-new call, reading the
  // booking row before (`booking`) and after (`updated`) the update so the
  // message/email can report both the old and new schedule.
  await sendBookingRescheduledNotification(booking, updated as Booking);

  return {
    booking: updated as Booking,
    policy_violation: policyViolation,
    notice_period_met: notice.met,
  };
}
