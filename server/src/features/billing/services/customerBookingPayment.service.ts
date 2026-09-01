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
  let paymentChoice: 'full' | 'downpayment';

  if (payInFull) {
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

  // The still-Pending charge to attach to, if any (createInitialBookingCharge's
  // row, or a staff-added balance charge). A booking carries at most one.
  const { data: pendingCharge } = await supabase
    .from('transactions')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_status', 'Pending')
    .limit(1)
    .maybeSingle();

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
