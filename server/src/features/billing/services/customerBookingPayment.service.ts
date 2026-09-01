import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getBookingById } from '../../booking/services/booking.service.ts';
import { isOnlinePaymentsEnabled } from '../../booking/services/staffPicker.service.ts';
import { initiatePaymongoPayment } from './paymongo.service.ts';
import type { Transaction } from '../billing.types.ts';
import type { Booking } from '../../booking/booking.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PayForBookingParams {
  requesterId: string;
  bookingId: string;
  paymentMethod: 'GCash' | 'Maya';
  payInFull: boolean;
}

export interface PayForBookingResult {
  transaction: Transaction;
  checkoutUrl: string;
}

/** net of any booking-time discount/promo - the amount the rest of the
 * payment/transactions rework (settle_transaction, add_booking_payment,
 * recomputeBookingPaymentStatus) consistently bills against. */
function netTotal(booking: Booking): number {
  return round2(
    booking.total_price - booking.discount_amount - booking.promo_amount
  );
}

/**
 * Customer self-service payment for their own booking (the Pay button on
 * CustomerBookingsPage) - a real PayMongo checkout. `createInitialBookingCharge`
 * (booking.service.ts) already wrote one 'Pending' booking_payment transaction
 * at booking time; this path finds that charge and attaches the PayMongo
 * details to it (tagging initiated_by: 'customer' so confirmPaymongoWebhookEvent
 * recomputes the booking's payment_status once PayMongo confirms), rather than
 * inserting a second charge. It only inserts a fresh row when there is no
 * outstanding charge to attach to (e.g. a balance payment after an earlier
 * partial, or a Veterinary booking that got no upfront charge).
 */
export async function payForBooking({
  requesterId,
  bookingId,
  paymentMethod,
  payInFull,
}: PayForBookingParams): Promise<PayForBookingResult> {
  const booking = await getBookingById({ requesterId, bookingId });

  if (booking.customer_id !== requesterId) {
    throwWithStatus(403, 'You can only pay for your own bookings');
  }

  if (booking.payment_status === 'Fully Paid') {
    throwWithStatus(409, 'This booking is already fully paid');
  }

  // The still-Pending charge to attach this checkout to, if any:
  // createInitialBookingCharge's row, or a customer/staff-added balance
  // charge. A booking carries at most one.
  const { data: pendingCharge } = await supabase
    .from('transactions')
    .select('id, payment_choice, total_amount')
    .eq('booking_id', booking.id)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_status', 'Pending')
    .limit(1)
    .maybeSingle();

  // What's actually still owed: the net total less everything already settled.
  const { data: settledRows } = await supabase
    .from('transactions')
    .select('total_amount')
    .eq('booking_id', booking.id)
    .eq('transaction_type', 'booking_payment')
    .neq('payment_status', 'Pending');

  const settled = round2(
    (settledRows ?? []).reduce(
      (sum, row) =>
        sum + Number((row as { total_amount: number }).total_amount),
      0
    )
  );
  const remaining = round2(netTotal(booking) - settled);

  let amount: number;
  let paymentChoice: 'full' | 'downpayment' | 'balance';

  if (pendingCharge?.payment_choice === 'balance') {
    // A customer-chosen partial balance charge - pay it for exactly the
    // amount it was created for, don't recompute to the full remainder.
    amount = round2(Number(pendingCharge.total_amount));
    paymentChoice = 'balance';
  } else if (payInFull) {
    amount = remaining;
    paymentChoice = 'full';
  } else {
    if (!booking.downpayment_required || !booking.downpayment_amount) {
      throwWithStatus(400, 'This booking does not require a downpayment');
    }
    amount = round2(Math.min(booking.downpayment_amount, remaining));
    paymentChoice = 'downpayment';
  }

  if (amount <= 0) {
    throwWithStatus(409, 'There is nothing left to pay on this booking');
  }

  const onlinePaymentsEnabled = await isOnlinePaymentsEnabled(
    booking.branch_id
  );
  if (!onlinePaymentsEnabled) {
    throwWithStatus(
      403,
      'Online payments are currently unavailable for this branch'
    );
  }

  let checkoutUrl: string;
  let sourceId: string;

  try {
    const initiated = await initiatePaymongoPayment({
      paymentMethod,
      amount,
      description: `Booking payment - ${booking.id}`,
      redirectSuccessUrl: process.env.PAYMONGO_REDIRECT_SUCCESS_URL ?? '',
      redirectFailedUrl: process.env.PAYMONGO_REDIRECT_FAILED_URL ?? '',
    });
    checkoutUrl = initiated.checkoutUrl;
    sourceId = initiated.sourceId;
  } catch {
    throwWithStatus(
      502,
      'Payment service is currently unavailable - please try again later'
    );
  }

  const chargeFields = {
    payment_method: paymentMethod,
    payment_status: 'Pending' as const,
    subtotal_amount: amount,
    total_amount: amount,
    payment_reference: sourceId,
    initiated_by: 'customer' as const,
    payment_choice: paymentChoice,
    updated_at: new Date().toISOString(),
  };

  const { data: transaction, error } = pendingCharge
    ? await supabase
        .from('transactions')
        .update(chargeFields)
        .eq('id', pendingCharge.id)
        .select('*')
        .maybeSingle()
    : await supabase
        .from('transactions')
        .insert({
          booking_id: booking.id,
          customer_id: booking.customer_id,
          branch_id: booking.branch_id,
          transaction_type: 'booking_payment',
          ...chargeFields,
        })
        .select('*')
        .maybeSingle();

  if (error || !transaction) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to record this payment attempt'
    );
  }

  return { transaction: transaction as Transaction, checkoutUrl };
}

export interface AddCustomerBalancePaymentParams {
  requesterId: string;
  bookingId: string;
  amount: number;
}

/**
 * Payment/transactions rework, gap B: a customer splitting their own
 * remaining balance into instalments. A booking that is 'Partially Paid'
 * had a down payment settled and still owes a balance (the down-payment
 * scheme - a 'full'-scheme booking is either Pending or Fully Paid), so the
 * customer may create a fresh Pending 'balance' charge for any amount up to
 * what's left and settle it like any other transaction; if it doesn't cover
 * the rest they can do it again.
 *
 * Reuses the staff `add_booking_payment` RPC (which re-checks amount <=
 * remaining atomically under a booking row lock). p_processed_by is null -
 * no staff member handled it, and the column FKs staff_profiles.
 */
export async function addCustomerBalancePayment({
  requesterId,
  bookingId,
  amount,
}: AddCustomerBalancePaymentParams): Promise<Transaction> {
  const booking = await getBookingById({ requesterId, bookingId });

  if (booking.customer_id !== requesterId) {
    throwWithStatus(403, 'You can only pay for your own bookings');
  }

  if (booking.payment_status !== 'Partially Paid') {
    throwWithStatus(
      400,
      'You can only split a payment on a booking with a partly-paid balance'
    );
  }

  // One unsettled charge at a time - the RPC's "remaining" nets only settled
  // rows, so a second Pending balance charge could over-collect (mirrors the
  // staff addBookingPayment guard).
  const { data: pendingCharge } = await supabase
    .from('transactions')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_status', 'Pending')
    .limit(1)
    .maybeSingle();

  if (pendingCharge) {
    throwWithStatus(
      409,
      'This booking already has a payment awaiting settlement - pay that one first'
    );
  }

  const { data, error } = await supabase.rpc('add_booking_payment', {
    p_booking_id: booking.id,
    p_amount: amount,
    p_processed_by: null,
  });

  if (error || !data) {
    const message = /exceeds remaining balance/.test(error?.message ?? '')
      ? 'That amount is more than the balance left on this booking'
      : (error?.message ?? 'Could not add this payment');
    throwWithStatus(400, message);
  }

  return data as Transaction;
}
