import { supabase } from '../../../config/supabase/supabase.config.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import { assertChecklistComplete } from './careLogCompletion.service.ts';
import { recordActivity } from './activityLog.service.ts';
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
  /** Custom change (activity logbook): who performed the checkout, for the
   * logbook entry - optional so existing call sites/tests that never had a
   * reason to know the requester keep working unchanged. */
  requesterId?: string;
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
 * Booking-status revision: for Hotel, checkout gating still keys off the
 * joined booking's status ('In Progress' required) rather than the stays
 * row's own `status` column - completeBooking() is what actually advances
 * the booking (In Progress -> Completed/Paid). completeBooking's own
 * read-then-write isn't itself atomic against a second concurrent checkout
 * call for the same stay (it reads the booking, checks status, then writes
 * - no conditional guard in the UPDATE itself), so it alone would NOT
 * reproduce a single-writer guarantee. The real race gate is a conditional
 * UPDATE against `stays` - `actual_check_out_at IS NULL` (both this and
 * `status` are kept in sync at checkout, but `actual_check_out_at` is the
 * one this conditional update actually guards on). Only the request that
 * wins that conditional update goes on to release the cage / return a
 * result; the loser gets the same 409 as before. completeBooking is called
 * first so an illegal transition (e.g. the booking was never started) fails
 * fast without mutating `stays` at all.
 *
 * Custom change (Daycare/Hotel parity, migration 20260807104): `stays.status`
 * was reintroduced (it originally lived on hotel_stays, then was dropped by
 * the booking-status revision, then came back once Daycare walk-ins - which
 * have no booking at all - needed to share this table). Hotel rows keep
 * setting it here for read-path consistency (careLogCompletion.service.ts
 * now filters on `stays.status` directly instead of joining through
 * `bookings`), even though this function's own gating
 * still authoritatively reads the booking's status, not this column.
 */
export async function checkOutHotelStay({
  stayId,
  branchId,
  requesterId,
}: CheckoutParams): Promise<CheckoutResult> {
  const { data: stay, error: stayError } = await supabase
    .from('stays')
    .select('*, cages!inner(branch_id), bookings!inner(total_price, status)')
    .eq('id', stayId)
    .eq('stay_type', 'Hotel')
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

  // Custom change (checkout gating): blocks checkout while the Boarding
  // Checklist still has actionable (Pending/In Progress) tasks - Missed
  // tasks don't block, see assertChecklistComplete's own docs.
  await assertChecklistComplete(stayId);

  const now = new Date();
  const days = extensionDays(stay.scheduled_check_out_date, now);
  const extensionFee = days > 0 ? days * EXTENSION_FEE_PER_DAY : null;

  const totalPrice = (stay as unknown as { bookings: { total_price: number } })
    .bookings.total_price;
  const remainingBalance =
    totalPrice - Number(stay.downpayment_amount) + (extensionFee ?? 0);

  await completeBooking({ bookingId: stay.booking_id });

  const { data: updated, error: updateError } = await supabase
    .from('stays')
    .update({
      status: 'Completed',
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

  await recordActivity({
    branchId,
    stayId,
    action: 'check_out',
    actorStaffId: requesterId,
    description:
      extensionFee != null
        ? `Checked out of a Hotel stay (₱${extensionFee} extension fee)`
        : 'Checked out of a Hotel stay',
  });

  return {
    stay: updated as HotelStay,
    downpaymentAmount: Number(updated.downpayment_amount),
    extensionFee,
    remainingBalance,
  };
}
