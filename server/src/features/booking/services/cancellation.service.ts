import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  CANCELLABLE_BOOKING_STATUSES,
  type Booking,
} from '../booking.types.ts';
import type { CancelBookingInput } from '../modules/validators/booking.validator.ts';
import {
  evaluateNoticePeriod,
  loadBookingForChange,
} from './reschedule.service.ts';
import {
  markCreditIssuedOnLog,
  writeCancellationLog,
} from './cancellationLog.service.ts';
import { issueCredit } from '../../credits/services/creditIssuance.service.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface CancellationResult {
  booking: Booking;
  /** Whether the configured notice period was met - decides the financial
   * consequence below (#91). */
  notice_period_met: boolean;
  /** True when enforcement is on and notice wasn't met, mirroring the
   * reschedule response so #59's UI surfaces both the same way. */
  policy_violation: boolean;
  /** #91/#93: whether a qualifying Hotel downpayment was actually converted
   * to a credit_balances increment for this event. */
  credit_issued: boolean;
}

interface CancelParams {
  requesterId: string;
  bookingId: string;
  input: CancelBookingInput;
}

/**
 * Issue #54/#91: cancellation with the notice-period check from #54.
 * Unlike reschedule, an unmet notice never BLOCKS a cancellation - per the
 * M03 Process 5 flow diagram, the booking is set to Cancelled on both notice
 * branches; what the notice outcome decides is the financial consequence
 * (downpayment -> credit vs forfeited).
 *
 * evaluateNoticePeriod() itself is unchanged (Sprint 2 #54) - this issue
 * only fills the TODO(Sprint 5, M09/M10) marker that used to sit here: every
 * event writes a cancellation_logs row (AC-5), and a qualifying cancellation
 * (notice met AND a non-refundable downpayment actually exists to convert -
 * Grooming/Daycare/Veterinary bookings have no downpayment concept at all)
 * additionally calls into #93's creditIssuance.service.ts. Strict-mode
 * cancellations are never blocked by notice - Strict only withholds credit,
 * exactly as Sprint 2 already distinguished from a Strict reschedule
 * (reschedule.service.ts), which IS blocked outright.
 */
export async function cancelBooking({
  requesterId,
  bookingId,
  input,
}: CancelParams): Promise<CancellationResult> {
  const { booking } = await loadBookingForChange(requesterId, bookingId);

  if (!CANCELLABLE_BOOKING_STATUSES.includes(booking.status)) {
    throwWithStatus(409, `A ${booking.status} booking cannot be cancelled`);
  }

  const notice = await evaluateNoticePeriod(
    booking.branch_id,
    booking.scheduled_start
  );

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({
      status: 'Cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: input.cancellation_reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select('*')
    .maybeSingle();

  if (error || !updated) {
    throwWithStatus(400, error?.message ?? 'Failed to cancel booking');
  }

  const policyViolation = notice.enforced && !notice.met;

  const log = await writeCancellationLog({
    bookingId: booking.id,
    customerId: booking.customer_id,
    branchId: booking.branch_id,
    eventType: 'cancellation',
    noticePeriodMet: notice.met,
    enforcementModeApplied: notice.policy.notice_enforcement_mode,
    policyViolation,
  });

  const downpayment = booking.downpayment_amount ?? 0;
  const qualifies = notice.met && downpayment > 0;

  let creditIssued = false;

  if (qualifies && log) {
    const expiresAt = notice.policy.credit_expiry_enabled
      ? new Date(
          Date.now() + notice.policy.credit_expiry_days * DAY_MS
        ).toISOString()
      : null;

    const transaction = await issueCredit({
      customerId: booking.customer_id,
      branchId: booking.branch_id,
      amount: downpayment,
      cancellationLogId: log.id,
      expiresAt,
    });

    if (transaction) {
      creditIssued = true;
      await markCreditIssuedOnLog(log.id, downpayment);
    }
  }

  return {
    booking: updated as Booking,
    notice_period_met: notice.met,
    policy_violation: policyViolation,
    credit_issued: creditIssued,
  };
}
