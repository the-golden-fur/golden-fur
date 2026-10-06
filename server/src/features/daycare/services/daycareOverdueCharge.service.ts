import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  recomputeBookingGroupPaymentStatus,
  recomputeBookingPaymentStatus,
} from '../../booking/services/booking.service.ts';
import type { Transaction } from '../../billing/billing.types.ts';
import { DAYCARE_OVERDUE_FEE_PER_HOUR } from '../modules/daycareCharge.util.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PostDaycareOverdueChargeParams {
  bookingId: string;
  /** Whole overdue hours billed (after the grace period). */
  overdueHours: number;
  /** overdueHours x the flat overdue rate. */
  overdueFee: number;
  /** Who checked the pet out - recorded on a newly-created charge. */
  requesterId?: string;
}

interface BookingRow {
  id: string;
  customer_id: string;
  branch_id: string;
  total_price: number;
  booking_group_id: string | null;
}

/**
 * Puts a Daycare overdue checkout fee onto the booking's `transactions`, so
 * the cashier sees it and can collect it.
 *
 * A booking's charges are created up front, at booking time, from the hours
 * that were booked (create_initial_booking_charge) - the overdue fee only
 * exists once the pet is actually checked out late, so nothing would ever
 * add it to those charges otherwise: it would sit on stays.extension_fee,
 * invisible to the Transactions list. Mirrors how extendStay.service.ts
 * reconciles a Hotel extension:
 *
 * - if the booking (or, for a multi-booking checkout, its booking group)
 *   still has an open Pending 'balance' transaction, the fee is added to
 *   that one, with its own line item;
 * - otherwise a new Pending 'balance' transaction is created for just the
 *   fee.
 *
 * The total the booking is paid up against grows by the fee too
 * (bookings.total_price / booking_groups.net_total), so a booking that was
 * Fully Paid for its booked hours correctly reads Partially Paid until the
 * overdue fee is collected.
 */
export async function postDaycareOverdueCharge({
  bookingId,
  overdueHours,
  overdueFee,
  requesterId,
}: PostDaycareOverdueChargeParams): Promise<Transaction> {
  const { data: bookingRow, error: bookingError } = await supabase
    .from('bookings')
    .select('id, customer_id, branch_id, total_price, booking_group_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!bookingRow) throwWithStatus(404, 'Booking not found');

  const booking = bookingRow as BookingRow;
  const groupId = booking.booking_group_id;
  const nowIso = new Date().toISOString();

  const { error: updateBookingError } = await supabase
    .from('bookings')
    .update({
      total_price: round2(Number(booking.total_price) + overdueFee),
      updated_at: nowIso,
    })
    .eq('id', bookingId);

  if (updateBookingError) throwWithStatus(400, updateBookingError.message);

  if (groupId) {
    const { data: groupRow, error: groupError } = await supabase
      .from('booking_groups')
      .select('net_total')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) throwWithStatus(400, groupError.message);

    if (groupRow) {
      const { error: updateGroupError } = await supabase
        .from('booking_groups')
        .update({
          net_total: round2(
            Number((groupRow as { net_total: number }).net_total) + overdueFee
          ),
          updated_at: nowIso,
        })
        .eq('id', groupId);

      if (updateGroupError) throwWithStatus(400, updateGroupError.message);
    }
  }

  // A grouped booking's transactions hang off the group, never the booking
  // (transactions_booking_id_matches_type) - so that is where its fee goes.
  const ownerColumn = groupId ? 'booking_group_id' : 'booking_id';
  const ownerId = groupId ?? bookingId;

  const { data: openBalanceRow, error: openBalanceError } = await supabase
    .from('transactions')
    .select('*')
    .eq(ownerColumn, ownerId)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_choice', 'balance')
    .eq('payment_status', 'Pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openBalanceError) throwWithStatus(400, openBalanceError.message);

  let transaction: Transaction;

  if (openBalanceRow) {
    const existing = openBalanceRow as Transaction;

    const { data: updatedTxn, error: updateTxnError } = await supabase
      .from('transactions')
      .update({
        subtotal_amount: round2(Number(existing.subtotal_amount) + overdueFee),
        total_amount: round2(Number(existing.total_amount) + overdueFee),
        updated_at: nowIso,
      })
      .eq('id', existing.id)
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
        subtotal_amount: overdueFee,
        total_amount: overdueFee,
        processed_by_staff_id: requesterId ?? null,
      })
      .select('*')
      .maybeSingle();

    if (newTxnError || !newTxn) {
      throwWithStatus(
        400,
        newTxnError?.message ?? 'Failed to create the overdue checkout charge'
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
      description: `Daycare overdue checkout fee (${overdueHours} hour${
        overdueHours === 1 ? '' : 's'
      } x ₱${DAYCARE_OVERDUE_FEE_PER_HOUR})`,
      quantity: overdueHours,
      unit_price: DAYCARE_OVERDUE_FEE_PER_HOUR,
      line_total: overdueFee,
    });

  if (lineItemError) throwWithStatus(400, lineItemError.message);

  // The charge itself is already saved; a failed status roll-up must not
  // undo it (same best-effort stance as checkoutBooking).
  try {
    if (groupId) {
      await recomputeBookingGroupPaymentStatus(groupId);
    } else {
      await recomputeBookingPaymentStatus(bookingId);
    }
  } catch (rollupError) {
    console.error(
      `postDaycareOverdueCharge: failed to roll up payment_status for booking ${bookingId}:`,
      rollupError
    );
  }

  return transaction;
}
