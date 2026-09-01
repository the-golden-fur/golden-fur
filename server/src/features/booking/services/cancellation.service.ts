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
import { sendBookingCancelledNotification } from './bookingNotifications.service.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Money the business has actually confirmed against this booking - the sum
 * of its `booking_payment` transactions a cashier or the PayMongo webhook
 * has settled (`payment_status` off 'Pending').
 *
 * This is deliberately NOT the booking's own `payment_status` rollup: that
 * is derived from these same rows, and this stays a direct read so the
 * credit amount can never be inflated by a rollup lag. A booking with no
 * settled transaction returns 0 -> no credit.
 */
async function confirmedAmountPaid(bookingId: string): Promise<number> {
  const { data, error } = await supabase
    .from('transactions')
    .select('total_amount')
    .eq('booking_id', bookingId)
    .eq('transaction_type', 'booking_payment')
    .neq('payment_status', 'Pending');

  if (error || !data) return 0;

  return round2(
    data.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0)
  );
}

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
  /** #91/#93: whether a share of what the customer paid was actually
   * converted to a credit_balances increment for this event (notice met,
   * something was paid, and issue_credit succeeded). */
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
 * (paid amount -> credit vs forfeited).
 *
 * evaluateNoticePeriod() itself is unchanged (Sprint 2 #54) - this issue
 * only fills the TODO(Sprint 5, M09/M10) marker that used to sit here: every
 * event writes a cancellation_logs row (AC-5), and a qualifying cancellation
 * (notice met AND the customer actually paid something) additionally calls
 * into #93's creditIssuance.service.ts, converting
 * cancellation_credit_conversion_rate percent (default 100) of what was paid
 * (advisor addendum #10). Strict-mode cancellations are never blocked by
 * notice - Strict only withholds credit, exactly as Sprint 2 already
 * distinguished from a Strict reschedule (reschedule.service.ts), which IS
 * blocked outright.
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

  // #91/#93 + advisor addendum #10: convert a share of what the customer
  // has actually paid - only confirmed booking_payment transactions count,
  // so an unpaid (or "Paid"-but-uncollected) booking mints no credit, and a
  // paid-in-full booking gets its whole settled amount back - at the
  // branch's configured cancellation_credit_conversion_rate (default 100%).
  // The transaction read is skipped entirely when notice wasn't met (the
  // payment is forfeited regardless).
  const rate = notice.policy.cancellation_credit_conversion_rate; // 0-100
  const amountPaid = notice.met ? await confirmedAmountPaid(booking.id) : 0;
  const creditAmount = round2(amountPaid * (rate / 100));
  const qualifies = notice.met && creditAmount > 0;

  let creditIssued = false;

  // #117: credit issuance must NOT be gated on the cancellation_logs write
  // succeeding - that write is best-effort and returns null on failure,
  // which previously skipped the credit the customer was owed.
  // credit_transactions.cancellation_log_id is nullable, so a missing log
  // row is fine.
  if (qualifies) {
    const expiresAt = notice.policy.credit_expiry_enabled
      ? new Date(
          Date.now() + notice.policy.credit_expiry_days * DAY_MS
        ).toISOString()
      : null;

    const transaction = await issueCredit({
      customerId: booking.customer_id,
      branchId: booking.branch_id,
      amount: creditAmount,
      cancellationLogId: log?.id ?? null,
      expiresAt,
    });

    if (transaction) {
      creditIssued = true;
      if (log) await markCreditIssuedOnLog(log.id, creditAmount);
    }
  }

  // Issue #98: positioned immediately after the credit issuance block above
  // (not before it), so the message can report whether credit was actually
  // issued and the amount - no stub existed for this event before this
  // issue wired it.
  await sendBookingCancelledNotification({
    booking: updated as Booking,
    noticePeriodMet: notice.met,
    policyViolation,
    creditAmount: creditIssued ? creditAmount : null,
  });

  return {
    booking: updated as Booking,
    notice_period_met: notice.met,
    policy_violation: policyViolation,
    credit_issued: creditIssued,
  };
}
