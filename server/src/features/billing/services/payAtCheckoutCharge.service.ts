import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  recomputeBookingGroupPaymentStatus,
  recomputeBookingPaymentStatus,
} from '../../booking/services/booking.service.ts';
import type { Transaction } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PostPayAtCheckoutChargeParams {
  bookingId: string;
  /** What the stay actually cost, before discount/promo - replaces the
   * estimate the booking was created with. */
  actualTotal: number;
  /** How the stay reads on the bill, e.g. "Hotel stay (3 nights)". */
  lineItem: { description: string; quantity: number; unitPrice: number };
  /** Who checked the pet out - recorded on a newly-created charge. */
  requesterId?: string;
}

interface BookingRow {
  id: string;
  customer_id: string;
  branch_id: string;
  total_price: number;
  discount_amount: number;
  promo_amount: number;
  booking_group_id: string | null;
}

type PostedRow = Pick<
  Transaction,
  'id' | 'total_amount' | 'subtotal_amount' | 'payment_status'
> & { payment_choice: string | null };

/**
 * Pay at checkout (bookings.pay_at_checkout): a Walk-in Hotel/Daycare
 * booking created with no upfront charge is billed here, once, when the pet
 * is checked out - from the time it actually stayed, not the estimate it was
 * booked with. Puts that bill onto `transactions` as a Pending 'balance' row
 * so the cashier sees it and can collect it, the same way
 * daycareOverdueCharge.service.ts posts an overdue fee:
 *
 * - bookings.total_price becomes the actual total (and a grouped booking's
 *   booking_groups.net_total moves by the same difference);
 * - the bill is whatever is owed and not yet on a transaction: the actual
 *   total, minus the discount/promo fixed at booking time, minus anything
 *   already posted (e.g. a mid-stay extension charge). For a multi-booking
 *   checkout that sum runs over the group - only members already checked
 *   out count, so one pet's bill never includes another's estimate;
 * - it joins an open Pending 'balance' transaction if there is one,
 *   otherwise a new one is created.
 *
 * Returns the transaction billed, or null when nothing is owed (a discount
 * covering the whole stay) - a lone booking is then marked Fully Paid here,
 * since the payment rollup only ever moves on a settled transaction.
 */
export async function postPayAtCheckoutCharge({
  bookingId,
  actualTotal,
  lineItem,
  requesterId,
}: PostPayAtCheckoutChargeParams): Promise<Transaction | null> {
  const { data: bookingRow, error: bookingError } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, branch_id, total_price, discount_amount, promo_amount, booking_group_id'
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!bookingRow) throwWithStatus(404, 'Booking not found');

  const booking = bookingRow as BookingRow;
  const groupId = booking.booking_group_id;
  const nowIso = new Date().toISOString();
  const total = round2(actualTotal);

  const { error: updateBookingError } = await supabase
    .from('bookings')
    .update({ total_price: total, updated_at: nowIso })
    .eq('id', bookingId);

  if (updateBookingError) throwWithStatus(400, updateBookingError.message);

  let grossOwed = total;
  let discounts =
    Number(booking.discount_amount) + Number(booking.promo_amount);

  if (groupId) {
    const { data: groupRow, error: groupError } = await supabase
      .from('booking_groups')
      .select('net_total, discount_amount, promo_amount')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) throwWithStatus(400, groupError.message);
    if (!groupRow) throwWithStatus(404, 'Booking group not found');

    const group = groupRow as {
      net_total: number;
      discount_amount: number;
      promo_amount: number;
    };

    const { error: updateGroupError } = await supabase
      .from('booking_groups')
      .update({
        net_total: round2(
          Number(group.net_total) + total - Number(booking.total_price)
        ),
        updated_at: nowIso,
      })
      .eq('id', groupId);

    if (updateGroupError) throwWithStatus(400, updateGroupError.message);

    const { data: checkedOutRows, error: checkedOutError } = await supabase
      .from('bookings')
      .select('total_price')
      .eq('booking_group_id', groupId)
      .eq('status', 'Completed')
      .neq('id', bookingId);

    if (checkedOutError) throwWithStatus(400, checkedOutError.message);

    grossOwed = (
      (checkedOutRows ?? []) as Array<{ total_price: number }>
    ).reduce((sum, row) => sum + Number(row.total_price), total);
    discounts = Number(group.discount_amount) + Number(group.promo_amount);
  }

  // A grouped booking's transactions hang off the group, never the booking
  // (transactions_booking_id_matches_type) - so that is where its bill goes.
  const ownerColumn = groupId ? 'booking_group_id' : 'booking_id';
  const ownerId = groupId ?? bookingId;

  const { data: postedRows, error: postedError } = await supabase
    .from('transactions')
    .select('id, total_amount, subtotal_amount, payment_status, payment_choice')
    .eq(ownerColumn, ownerId)
    .eq('transaction_type', 'booking_payment')
    .order('created_at', { ascending: false });

  if (postedError) throwWithStatus(400, postedError.message);

  const posted = (postedRows ?? []) as PostedRow[];
  const alreadyPosted = posted.reduce(
    (sum, row) => sum + Number(row.total_amount),
    0
  );
  const bill = round2(Math.max(0, grossOwed - discounts - alreadyPosted));

  if (bill <= 0) {
    if (!groupId && alreadyPosted <= 0) {
      const { error: paidError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'Fully Paid',
          paid_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', bookingId);

      if (paidError) throwWithStatus(400, paidError.message);
    }

    return null;
  }

  const openBalance = posted.find(
    (row) =>
      row.payment_status === 'Pending' && row.payment_choice === 'balance'
  );

  let transaction: Transaction;

  if (openBalance) {
    const { data: updatedTxn, error: updateTxnError } = await supabase
      .from('transactions')
      .update({
        subtotal_amount: round2(Number(openBalance.subtotal_amount) + bill),
        total_amount: round2(Number(openBalance.total_amount) + bill),
        updated_at: nowIso,
      })
      .eq('id', openBalance.id)
      .select('*')
      .maybeSingle();

    if (updateTxnError || !updatedTxn) {
      throwWithStatus(
        400,
        updateTxnError?.message ?? 'Failed to update the balance transaction'
      );
    }

    transaction = updatedTxn as Transaction;
  } else {
    const { data: newTxn, error: newTxnError } = await supabase
      .from('transactions')
      .insert({
        booking_id: groupId ? null : bookingId,
        booking_group_id: groupId,
        customer_id: booking.customer_id,
        branch_id: booking.branch_id,
        transaction_type: 'booking_payment',
        // Placeholder, overwritten when the money is collected - same as
        // create_initial_booking_charge's own Pending rows.
        payment_method: 'Cash',
        payment_status: 'Pending',
        payment_choice: 'balance',
        subtotal_amount: bill,
        total_amount: bill,
        processed_by_staff_id: requesterId ?? null,
      })
      .select('*')
      .maybeSingle();

    if (newTxnError || !newTxn) {
      throwWithStatus(
        400,
        newTxnError?.message ?? 'Failed to create the checkout charge'
      );
    }

    transaction = newTxn as Transaction;
  }

  const { error: lineItemError } = await supabase
    .from('transaction_line_items')
    .insert({
      transaction_id: transaction.id,
      line_item_type: 'service',
      reference_id: null,
      description: lineItem.description,
      quantity: lineItem.quantity,
      unit_price: lineItem.unitPrice,
      line_total: bill,
    });

  if (lineItemError) throwWithStatus(400, lineItemError.message);

  // The charge itself is already saved; a failed status roll-up must not
  // undo it (same best-effort stance as postDaycareOverdueCharge).
  try {
    if (groupId) {
      await recomputeBookingGroupPaymentStatus(groupId);
    } else {
      await recomputeBookingPaymentStatus(bookingId);
    }
  } catch (rollupError) {
    console.error(
      `postPayAtCheckoutCharge: failed to roll up payment_status for booking ${bookingId}:`,
      rollupError
    );
  }

  return transaction;
}
