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

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface CancellationResult {
  booking: Booking;
  /** Whether the configured notice period was met - the future M10 credit
   * qualification hook (a qualifying Hotel cancellation converts the
   * downpayment to credit; an unmet one forfeits it). */
  notice_period_met: boolean;
  /** True when enforcement is on and notice wasn't met, mirroring the
   * reschedule response so #59's UI surfaces both the same way. */
  policy_violation: boolean;
}

interface CancelParams {
  requesterId: string;
  bookingId: string;
  input: CancelBookingInput;
}

/**
 * Issue #54: cancellation with the same notice-period stub check as
 * reschedule. Unlike reschedule, an unmet notice never BLOCKS a cancellation
 * - per the M03 Process 5 flow diagram, the booking is set to Cancelled on
 * both notice branches; what the notice outcome decides is the financial
 * consequence (downpayment -> credit vs forfeited), which is Sprint 5
 * M09/M10 scope. The outcome is recorded on the booking row itself
 * (cancelled_at, cancellation_reason) and reported in the response.
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

  // TODO(Sprint 5, M09/M10): credit issuance goes here - on a qualifying
  // Hotel cancellation (notice met), convert the downpayment into a
  // branch-locked credit_balances entry with the configured expiry; on an
  // unmet notice, record the forfeiture in cancellation_logs. Neither table
  // exists yet, so this epic deliberately writes no credit balance anywhere
  // in this code path (#54 AC-5).

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

  return {
    booking: updated as Booking,
    notice_period_met: notice.met,
    policy_violation: notice.enforced && !notice.met,
  };
}
