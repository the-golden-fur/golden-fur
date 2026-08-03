import { supabase } from '../../../config/supabase/supabase.config.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import type { CheckoutResult, HotelStay } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Flat per-additional-day extension rate. Modules-Features specifies "per
 * configured hotel rate" with no concrete number, and the real M09 Policy
 * Configuration screen for it is Sprint 5 scope (Guide's Out of Scope) - this
 * is a placeholder judgment call, flagged in the verification doc, standing
 * in until a real settings-driven rate exists.
 */
const EXTENSION_FEE_PER_DAY = 500;

/** Whole calendar days late, rounding any partial day up to a full day -
 * e.g. checking out 3 hours into the day after the scheduled date is 1
 * billable extension day, not a fraction. */
export function extensionDays(
  scheduledCheckOutDate: string,
  actualCheckOutAt: Date
): number {
  const scheduled = new Date(`${scheduledCheckOutDate}T00:00:00.000Z`);
  const actualDate = new Date(
    `${actualCheckOutAt.toISOString().slice(0, 10)}T00:00:00.000Z`
  );

  const diffMs = actualDate.getTime() - scheduled.getTime();
  if (diffMs <= 0) return 0;

  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

interface CheckoutParams {
  stayId: string;
  branchId: string;
}

/**
 * Issue #78: on-time checkout leaves extension_fee NULL (never zero, so
 * billing can distinguish "no fee applied" from "a ₱0 fee was calculated" -
 * #78 dev notes). Reconciliation is stay total (booking.total_price,
 * snapshotted at booking time) minus the downpayment already collected plus
 * any extension fee. The cage is released to Available in the same call
 * that finishes the checkout. Billing-ready only, per Out of Scope - no
 * transactions row is created.
 * TODO(Sprint 5, M08): replace with a real transaction-creation call.
 *
 * Booking-status revision: hotel_stays no longer has its own status column,
 * so checkout is only possible while the joined booking is 'In Progress',
 * and completeBooking() is what actually advances the booking (In Progress
 * -> Completed/Paid). completeBooking's own read-then-write isn't itself
 * atomic against a second concurrent checkout call for the same stay (it
 * reads the booking, checks status, then writes - no conditional guard in
 * the UPDATE itself), so it alone would NOT reproduce the single-writer
 * guarantee the old `.eq('status', 'Active')` conditional update gave us.
 * The real race gate is still a conditional UPDATE against hotel_stays -
 * `actual_check_out_at IS NULL` takes over from the dropped `status =
 * 'Active'` predicate (both columns were kept for exactly this kind of
 * reason - see the M05 migration notes). Only the request that wins that
 * conditional update goes on to release the cage / return a result; the
 * loser gets the same 409 as before. completeBooking is called first so an
 * illegal transition (e.g. the booking was never started) fails fast without
 * mutating hotel_stays at all.
 */
export async function checkOutHotelStay({
  stayId,
  branchId,
}: CheckoutParams): Promise<CheckoutResult> {
  const { data: stay, error: stayError } = await supabase
    .from('hotel_stays')
    .select('*, cages!inner(branch_id), bookings!inner(total_price, status)')
    .eq('id', stayId)
    .maybeSingle();

  if (stayError) throwWithStatus(400, stayError.message);
  if (!stay) throwWithStatus(404, 'Hotel stay not found');

  const cageBranchId = (stay as unknown as { cages: { branch_id: string } })
    .cages.branch_id;

  if (cageBranchId !== branchId) {
    throwWithStatus(403, 'Hotel stay does not belong to your branch');
  }

  const bookingStatus = (stay as unknown as { bookings: { status: string } })
    .bookings.status;

  if (bookingStatus !== 'In Progress') {
    throwWithStatus(409, 'This hotel stay is already checked out');
  }

  const now = new Date();
  const days = extensionDays(stay.scheduled_check_out_date, now);
  const extensionFee = days > 0 ? days * EXTENSION_FEE_PER_DAY : null;

  const totalPrice = (stay as unknown as { bookings: { total_price: number } })
    .bookings.total_price;
  const remainingBalance =
    totalPrice - Number(stay.downpayment_amount) + (extensionFee ?? 0);

  await completeBooking({ bookingId: stay.booking_id });

  const { data: updated, error: updateError } = await supabase
    .from('hotel_stays')
    .update({
      actual_check_out_at: now.toISOString(),
      extension_fee: extensionFee,
      updated_at: now.toISOString(),
    })
    .eq('id', stayId)
    .is('actual_check_out_at', null)
    .select('*')
    .maybeSingle();

  if (updateError) throwWithStatus(400, updateError.message);
  if (!updated) {
    throwWithStatus(409, 'This hotel stay is already checked out');
  }

  await supabase
    .from('cages')
    .update({ status: 'Available', updated_at: now.toISOString() })
    .eq('id', updated.cage_id);

  return {
    stay: updated as HotelStay,
    downpaymentAmount: Number(updated.downpayment_amount),
    extensionFee,
    remainingBalance,
  };
}
