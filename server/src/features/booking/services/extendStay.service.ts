import { supabase } from '../../../config/supabase/supabase.config.ts';
import { recomputeBookingPaymentStatus, round2 } from './booking.service.ts';
import { checkCapacity } from './capacity.service.ts';
import type { Booking, BookingItem } from '../booking.types.ts';
import type { Transaction } from '../../billing/billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** A stay can still be extended before it's finished - mirrors
 * CANCELLABLE_BOOKING_STATUSES exactly (same "still active" set) but kept as
 * its own named constant since the two concerns (extend vs. cancel) are
 * independent and shouldn't drift together by accident. */
const EXTENDABLE_BOOKING_STATUSES: readonly Booking['status'][] = [
  'Pending',
  'In Progress',
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors booking.service.ts's own resolveQuantity() exactly (a private
 * module function there) - duplicated rather than exported to keep this
 * file's dependency on booking.service.ts limited to its exported surface
 * (round2), same rationale as bookingGroup.service.ts's own copy of the
 * reschedule-grace constant. Hotel-only: "how many of this item's own
 * duration_minutes_at_booking fit in the scheduled window". */
function resolveQuantity(
  scheduledStartIso: string,
  scheduledEndIso: string,
  itemDurationMinutes: number
): number {
  if (itemDurationMinutes <= 0) return 1;

  const totalMinutes =
    (new Date(scheduledEndIso).getTime() -
      new Date(scheduledStartIso).getTime()) /
    60000;

  return Math.max(1, Math.round(totalMinutes / itemDurationMinutes));
}

export interface ExtendHotelStayResult {
  booking: Booking;
  transaction: Transaction;
  added_amount: number;
}

interface ExtendHotelStayParams {
  requesterId: string;
  bookingId: string;
  additionalNights: number;
}

/**
 * Custom change (extend-hotel-stay): staff-only ("staff extend nights for
 * booked pets in hotel type services" - role-gated at the route level, same
 * BOOKING_MARK_PAID_ROLES set the Transactions page's mark-as-paid action
 * uses, since this creates a charge). Bumps scheduled_end and every Hotel
 * booking_items row's price proportionally to the added nights (each item
 * keeps its own per-night rate - a booking can hold more than one Hotel
 * item, e.g. a bundled package, each independently priced per
 * duration_minutes_at_booking), then reconciles the charge onto
 * `transactions`:
 *
 * - if the booking still has an open ('balance', Pending) transaction - the
 *   "remaining balance" row create_initial_booking_charge's downpayment
 *   scheme creates - its amount is increased by the extension charge, with a
 *   second transaction_line_items row recording the extension itself;
 * - otherwise (Fully Paid, or a 'full'-scheme booking already settled) a new
 *   Pending 'balance' transaction is created for just the extension charge.
 *
 * Does not touch discount_amount/promo_amount - a booking-level discount/
 * promo was evaluated against the originally booked nights and isn't
 * silently re-applied to nights added after the fact.
 *
 * No SECURITY DEFINER RPC here (unlike create_initial_booking_charge/
 * add_booking_payment/settle_transaction) - this is a single staff-initiated
 * write against one already-existing booking, not a race between concurrent
 * customer submissions, so the plain sequential-update pattern
 * reschedule.service.ts already uses for this same booking row is
 * sufficient.
 */
export async function extendHotelStay({
  requesterId,
  bookingId,
  additionalNights,
}: ExtendHotelStayParams): Promise<ExtendHotelStayResult> {
  const { data: bookingRow, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!bookingRow) throwWithStatus(404, 'Booking not found');

  const booking = bookingRow as Booking;

  if (booking.service_category !== 'Hotel') {
    throwWithStatus(400, 'Only a Hotel booking’s stay can be extended');
  }

  if (!EXTENDABLE_BOOKING_STATUSES.includes(booking.status)) {
    throwWithStatus(
      409,
      `A ${booking.status} booking's stay can no longer be extended`
    );
  }

  if (booking.booking_group_id) {
    throwWithStatus(
      400,
      'Extending a booking that is part of a multi-booking checkout is not supported yet'
    );
  }

  const newScheduledEnd = new Date(
    new Date(booking.scheduled_end).getTime() + additionalNights * ONE_DAY_MS
  ).toISOString();

  const { data: itemRows, error: itemsError } = await supabase
    .from('booking_items')
    .select('*')
    .eq('booking_id', bookingId);

  if (itemsError) throwWithStatus(400, itemsError.message);

  const items = (itemRows ?? []) as BookingItem[];

  if (items.length === 0) {
    throwWithStatus(400, 'This booking has no items to extend');
  }

  let addedAmount = 0;
  const itemUpdates: Array<{ id: string; price_at_booking: number }> = [];

  for (const item of items) {
    const oldQuantity = resolveQuantity(
      booking.scheduled_start,
      booking.scheduled_end,
      item.duration_minutes_at_booking
    );
    const newQuantity = resolveQuantity(
      booking.scheduled_start,
      newScheduledEnd,
      item.duration_minutes_at_booking
    );

    const unitPrice = item.price_at_booking / oldQuantity;
    const newItemPrice = round2(unitPrice * newQuantity);

    itemUpdates.push({ id: item.id, price_at_booking: newItemPrice });
    addedAmount = round2(addedAmount + (newItemPrice - item.price_at_booking));
  }

  if (addedAmount <= 0) {
    throwWithStatus(
      400,
      'Extending this stay did not add any nights - check the requested number of nights'
    );
  }

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('weight_class')
    .eq('id', booking.pet_id)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);
  if (!pet) throwWithStatus(404, 'Pet not found');

  const capacity = await checkCapacity({
    branchId: booking.branch_id,
    serviceCategory: 'Hotel',
    scheduledStart: booking.scheduled_start,
    scheduledEnd: newScheduledEnd,
    petWeightClass: pet.weight_class as 'S' | 'M' | 'L' | 'XL',
    excludeBookingId: booking.id,
  });

  if (!capacity.available) {
    throwWithStatus(
      409,
      capacity.reason ?? 'No cage capacity for the extended stay'
    );
  }

  const newTotalPrice = round2(booking.total_price + addedAmount);
  const nowIso = new Date().toISOString();

  const { error: updateBookingError } = await supabase
    .from('bookings')
    .update({
      scheduled_end: newScheduledEnd,
      total_price: newTotalPrice,
      updated_at: nowIso,
    })
    .eq('id', bookingId);

  if (updateBookingError) {
    throwWithStatus(400, updateBookingError.message);
  }

  for (const itemUpdate of itemUpdates) {
    const { error: updateItemError } = await supabase
      .from('booking_items')
      .update({ price_at_booking: itemUpdate.price_at_booking })
      .eq('id', itemUpdate.id);

    if (updateItemError) throwWithStatus(400, updateItemError.message);
  }

  // A checked-in stay tracks its own checkout date separately
  // (stays.scheduled_check_out_date, snapshotted at check-in) - keep it in
  // sync so checkout.service.ts's overstay math doesn't use a stale date.
  const { data: stayRow } = await supabase
    .from('stays')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (stayRow) {
    await supabase
      .from('stays')
      .update({
        scheduled_check_out_date: newScheduledEnd.slice(0, 10),
        updated_at: nowIso,
      })
      .eq('id', (stayRow as { id: string }).id);
  }

  const { data: openBalanceRow, error: openBalanceError } = await supabase
    .from('transactions')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_choice', 'balance')
    .eq('payment_status', 'Pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openBalanceError) throwWithStatus(400, openBalanceError.message);

  const lineItemDescription = `Stay extension (+${additionalNights} night${
    additionalNights === 1 ? '' : 's'
  })`;

  let transaction: Transaction;

  if (openBalanceRow) {
    const existing = openBalanceRow as Transaction;

    const { data: updatedTxn, error: updateTxnError } = await supabase
      .from('transactions')
      .update({
        subtotal_amount: round2(existing.subtotal_amount + addedAmount),
        total_amount: round2(existing.total_amount + addedAmount),
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

    const { error: lineItemError } = await supabase
      .from('transaction_line_items')
      .insert({
        transaction_id: existing.id,
        line_item_type: 'stay_extension',
        reference_id: null,
        description: lineItemDescription,
        quantity: additionalNights,
        unit_price: round2(addedAmount / additionalNights),
        line_total: addedAmount,
      });

    if (lineItemError) throwWithStatus(400, lineItemError.message);
  } else {
    const { data: newTxn, error: newTxnError } = await supabase
      .from('transactions')
      .insert({
        booking_id: bookingId,
        customer_id: booking.customer_id,
        branch_id: booking.branch_id,
        transaction_type: 'booking_payment',
        payment_method: 'Cash',
        payment_status: 'Pending',
        payment_choice: 'balance',
        subtotal_amount: addedAmount,
        total_amount: addedAmount,
        initiated_by: 'staff',
        processed_by_staff_id: requesterId,
      })
      .select('*')
      .maybeSingle();

    if (newTxnError || !newTxn) {
      throwWithStatus(
        400,
        newTxnError?.message ?? 'Failed to create the extension charge'
      );
    }

    transaction = newTxn as Transaction;

    const { error: lineItemError } = await supabase
      .from('transaction_line_items')
      .insert({
        transaction_id: transaction.id,
        line_item_type: 'stay_extension',
        reference_id: null,
        description: lineItemDescription,
        quantity: additionalNights,
        unit_price: round2(addedAmount / additionalNights),
        line_total: addedAmount,
      });

    if (lineItemError) throwWithStatus(400, lineItemError.message);
  }

  const updatedBooking = await recomputeBookingPaymentStatus(bookingId);

  return { booking: updatedBooking, transaction, added_amount: addedAmount };
}
