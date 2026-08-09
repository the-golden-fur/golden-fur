import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getBookingById } from '../../booking/services/booking.service.ts';
import { isOnlinePaymentsEnabled } from '../../booking/services/staffPicker.service.ts';
import { initiatePaymongoPayment } from './paymongo.service.ts';
import type { Transaction } from '../billing.types.ts';

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

/**
 * Customer self-service payment for their own booking (the Pay button on
 * CustomerBookingsPage) - a real PayMongo checkout, distinct from the
 * cashier's checkoutBooking (billing/checkoutAggregation.service.ts), which
 * always settles the full remaining amount as part of a staff-witnessed
 * counter interaction. This can pay either the full price or just the
 * catalog-required downpayment, and creates a 'Pending' transactions row
 * exactly like checkoutBooking does, tagged initiated_by: 'customer' so
 * confirmPaymongoWebhookEvent knows to also advance the booking's
 * payment_stage once PayMongo confirms (see that service for why the
 * cashier path is left untouched).
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

  if (booking.payment_stage === 'Paid') {
    throwWithStatus(409, 'This booking is already fully paid');
  }

  let amount: number;
  let paymentChoice: 'full' | 'downpayment';

  if (booking.payment_stage === 'Paid in Advance') {
    // The downpayment is already settled - the only thing left to pay is
    // the remaining balance, regardless of which choice the client sent.
    amount = round2(booking.total_price - (booking.downpayment_amount ?? 0));
    paymentChoice = 'full';
  } else if (payInFull) {
    amount = booking.total_price;
    paymentChoice = 'full';
  } else {
    if (!booking.downpayment_required || !booking.downpayment_amount) {
      throwWithStatus(400, 'This booking does not require a downpayment');
    }
    amount = booking.downpayment_amount;
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

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      branch_id: booking.branch_id,
      transaction_type: 'booking_payment',
      payment_method: paymentMethod,
      payment_status: 'Pending',
      subtotal_amount: amount,
      total_amount: amount,
      payment_reference: sourceId,
      initiated_by: 'customer',
      payment_choice: paymentChoice,
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
