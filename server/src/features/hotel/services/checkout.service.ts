import { supabase } from '../../../config/supabase/supabase.config.ts';
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
 * #79 revision: sum of every hotel-supplied (brought_by_customer = false)
 * care instruction's charged_price for this stay - NULL when nothing was
 * hotel-supplied, never zero, mirroring extension_fee's own NULL-vs-value
 * convention (dev notes above).
 */
async function getSuppliedItemsCharge(
  hotelStayId: string
): Promise<number | null> {
  const [feedingResult, medicationResult] = await Promise.all([
    supabase
      .from('care_feeding_instructions')
      .select('charged_price')
      .eq('hotel_stay_id', hotelStayId)
      .eq('brought_by_customer', false),
    supabase
      .from('care_medication_instructions')
      .select('charged_price')
      .eq('hotel_stay_id', hotelStayId)
      .eq('brought_by_customer', false),
  ]);

  if (feedingResult.error) throwWithStatus(400, feedingResult.error.message);
  if (medicationResult.error) {
    throwWithStatus(400, medicationResult.error.message);
  }

  const rows = [
    ...((feedingResult.data ?? []) as Array<{ charged_price: number | null }>),
    ...((medicationResult.data ?? []) as Array<{
      charged_price: number | null;
    }>),
  ];

  const total = rows.reduce((sum, row) => sum + (row.charged_price ?? 0), 0);

  return rows.length > 0 && total > 0 ? total : null;
}

/**
 * Issue #78: on-time checkout leaves extension_fee NULL (never zero, so
 * billing can distinguish "no fee applied" from "a ₱0 fee was calculated" -
 * #78 dev notes). Reconciliation is stay total (booking.total_price,
 * snapshotted at booking time) minus the downpayment already collected plus
 * any extension fee. The cage is released to Available in the same call
 * that marks the stay Completed. Billing-ready only, per Out of Scope - no
 * transactions row is created.
 * TODO(Sprint 5, M08): replace with a real transaction-creation call.
 */
export async function checkOutHotelStay({
  stayId,
  branchId,
}: CheckoutParams): Promise<CheckoutResult> {
  const { data: stay, error: stayError } = await supabase
    .from('hotel_stays')
    .select('*, cages!inner(branch_id), bookings!inner(total_price)')
    .eq('id', stayId)
    .maybeSingle();

  if (stayError) throwWithStatus(400, stayError.message);
  if (!stay) throwWithStatus(404, 'Hotel stay not found');

  const cageBranchId = (stay as unknown as { cages: { branch_id: string } })
    .cages.branch_id;

  if (cageBranchId !== branchId) {
    throwWithStatus(403, 'Hotel stay does not belong to your branch');
  }

  if (stay.status === 'Completed') {
    throwWithStatus(409, 'This hotel stay is already checked out');
  }

  const now = new Date();
  const days = extensionDays(stay.scheduled_check_out_date, now);
  const extensionFee = days > 0 ? days * EXTENSION_FEE_PER_DAY : null;
  const suppliedItemsCharge = await getSuppliedItemsCharge(stayId);

  const totalPrice = (stay as unknown as { bookings: { total_price: number } })
    .bookings.total_price;
  const remainingBalance =
    totalPrice -
    Number(stay.downpayment_amount) +
    (extensionFee ?? 0) +
    (suppliedItemsCharge ?? 0);

  const { data: updated, error: updateError } = await supabase
    .from('hotel_stays')
    .update({
      status: 'Completed',
      actual_check_out_at: now.toISOString(),
      extension_fee: extensionFee,
      supplied_items_charge: suppliedItemsCharge,
      updated_at: now.toISOString(),
    })
    .eq('id', stayId)
    .eq('status', 'Active')
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
    suppliedItemsCharge,
    remainingBalance,
  };
}
