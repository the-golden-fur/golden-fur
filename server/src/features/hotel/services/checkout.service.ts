import { supabase } from '../../../config/supabase/supabase.config.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import { resolveQuantity } from '../../booking/services/extendStay.service.ts';
import { resolveBookingLongStayTerms } from '../../booking/services/longStayTerms.service.ts';
import type { LongStayTerms } from '../../maintenance/utils/branchServicePrice.ts';
import { postPayAtCheckoutCharge } from '../../billing/services/payAtCheckoutCharge.service.ts';
import { postCheckoutExtras } from '../../billing/services/checkoutExtrasCharge.service.ts';
import { loadRemainingBalance } from '../../billing/services/transactionPayment.service.ts';
import { assertChecklistComplete } from './careLogCompletion.service.ts';
import { recordActivity } from './activityLog.service.ts';
import type { CheckoutResult, HotelStay } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * A late night is charged the booking's own normal nightly rate
 * (bookedNightlyRate) - never an hourly fee. A stay on a Hotel service with a
 * long-stay rate (20261013260) is charged that service's regular nightly
 * price instead, since a night past the booking always costs the regular
 * rate (resolveBookingLongStayTerms). This flat figure is only the fallback
 * for a booking with no Hotel item to read a nightly rate from.
 */
const EXTENSION_FEE_PER_DAY = 500;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Manila is UTC+8 all year - no DST to account for. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function manilaDayStart(instant: Date): number {
  const manilaDay = new Date(instant.getTime() + MANILA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

  return new Date(`${manilaDay}T00:00:00.000Z`).getTime();
}

/** Whole calendar days late, rounding any partial day up to a full day -
 * e.g. checking out 3 hours into the day after the scheduled date is 1
 * billable extension day, not a fraction. Days are Manila days, the same
 * way the cage card counts nights overdue (overdueDuration.ts) - a 7 AM
 * pickup the next morning is a day late even though it is still the
 * scheduled date in UTC. */
export function extensionDays(
  scheduledCheckOutDate: string,
  actualCheckOutAt: Date
): number {
  const scheduled = new Date(`${scheduledCheckOutDate}T00:00:00.000Z`);
  const diffMs = manilaDayStart(actualCheckOutAt) - scheduled.getTime();

  if (diffMs <= 0) return 0;

  return Math.ceil(diffMs / ONE_DAY_MS);
}

/**
 * Pay at checkout: the nights a stay is billed for - Manila calendar days
 * from the day the pet was checked in to the day it is checked out, never
 * fewer than one (a same-day pickup is still one night's stay).
 */
export function stayNights(checkInAt: Date, checkOutAt: Date): number {
  const days = Math.round(
    (manilaDayStart(checkOutAt) - manilaDayStart(checkInAt)) / ONE_DAY_MS
  );

  return Math.max(1, days);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PayAtCheckoutBooking {
  scheduled_start: string;
  scheduled_end: string;
}

/**
 * Pay at checkout: reprices the booking's items from the estimated nights
 * they were booked for to the nights actually stayed, each item keeping its
 * own per-night rate (the same math extendHotelStay uses), and returns the
 * new total. An item that isn't priced per night is left as it is.
 *
 * Hotel long-stay rate (20261013260): a pay-at-checkout stay never gets it.
 * When the booking's service item has `longStay` terms, every night
 * actually stayed is the regular rate, however many there were (and no
 * free package is awarded at booking either - createBooking).
 */
async function repriceItemsForNights(
  bookingId: string,
  booking: PayAtCheckoutBooking,
  checkInAt: Date,
  nights: number,
  longStay: LongStayTerms | null
): Promise<number> {
  const { data: itemRows, error: itemsError } = await supabase
    .from('booking_items')
    .select('id, service_id, price_at_booking, duration_minutes_at_booking')
    .eq('booking_id', bookingId);

  if (itemsError) throwWithStatus(400, itemsError.message);

  const actualEndIso = new Date(
    checkInAt.getTime() + nights * ONE_DAY_MS
  ).toISOString();
  let total = 0;

  for (const item of (itemRows ?? []) as Array<{
    id: string;
    service_id?: string | null;
    price_at_booking: number;
    duration_minutes_at_booking: number;
  }>) {
    const bookedQuantity = resolveQuantity(
      booking.scheduled_start,
      booking.scheduled_end,
      item.duration_minutes_at_booking
    );
    const actualQuantity = resolveQuantity(
      checkInAt.toISOString(),
      actualEndIso,
      item.duration_minutes_at_booking
    );
    const bookedPrice = Number(item.price_at_booking);
    const terms = item.service_id ? longStay : null;
    // Pay at checkout never gets the long-stay rate: every night actually
    // stayed is the regular rate - also correcting a booking made before
    // that rule, still holding the long-stay rate in price_at_booking.
    const price = terms
      ? round2(terms.regularRate * actualQuantity)
      : round2((bookedPrice / bookedQuantity) * actualQuantity);

    total = round2(total + price);

    if (price !== Number(item.price_at_booking)) {
      const { error: updateItemError } = await supabase
        .from('booking_items')
        .update({ price_at_booking: price })
        .eq('id', item.id);

      if (updateItemError) throwWithStatus(400, updateItemError.message);
    }
  }

  return total;
}

/**
 * The booking's normal price per night: each Hotel service item's price
 * spread over the nights it was booked for (the same per-night math
 * repriceItemsForNights and extendHotelStay use), added up. Null when the
 * booking has no service item to read it from.
 */
async function bookedNightlyRate(
  bookingId: string,
  booking: PayAtCheckoutBooking
): Promise<number | null> {
  const { data: itemRows, error: itemsError } = await supabase
    .from('booking_items')
    .select('service_id, price_at_booking, duration_minutes_at_booking')
    .eq('booking_id', bookingId);

  if (itemsError) throwWithStatus(400, itemsError.message);

  const items = (
    (itemRows ?? []) as Array<{
      service_id?: string | null;
      price_at_booking: number;
      duration_minutes_at_booking: number;
    }>
  ).filter((item) => item.service_id);

  if (items.length === 0) return null;

  return round2(
    items.reduce(
      (sum, item) =>
        sum +
        Number(item.price_at_booking) /
          resolveQuantity(
            booking.scheduled_start,
            booking.scheduled_end,
            item.duration_minutes_at_booking
          ),
      0
    )
  );
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
 * #78 dev notes). The cage is released to Available in the same call that
 * finishes the checkout. A late checkout's extension fee is posted to the
 * booking's Transactions (postCheckoutExtras), and remainingBalance is what
 * Transactions then says is still owed (loadRemainingBalance) - the screen
 * and the cashier always show the same figure.
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
 *
 * Custom change (pay at checkout, 20261005244): a booking created with
 * bookings.pay_at_checkout has no charge yet - its total was only an
 * estimate. Once the checkout itself is saved, its items are repriced to the
 * nights actually stayed (stayNights, from stays.check_in_at) and that bill
 * is posted to the cashier's Transactions list by postPayAtCheckoutCharge.
 * No extension fee applies: the extra nights are already billed at the
 * normal rate. If posting fails the checkout still stands, and the caller is
 * told so (same stance as Daycare's overdue fee).
 */
export async function checkOutHotelStay({
  stayId,
  branchId,
  requesterId,
}: CheckoutParams): Promise<CheckoutResult> {
  const { data: stay, error: stayError } = await supabase
    .from('stays')
    .select(
      '*, cages!inner(branch_id), bookings!inner(total_price, status, pay_at_checkout, scheduled_start, scheduled_end, booking_group_id)'
    )
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

  const booking = (
    stay as unknown as {
      bookings: PayAtCheckoutBooking & {
        total_price: number;
        status: string;
        pay_at_checkout?: boolean;
        booking_group_id?: string | null;
      };
    }
  ).bookings;
  const bookingStatus = booking.status;
  const payAtCheckout = booking.pay_at_checkout === true;

  if (bookingStatus !== 'In Progress') {
    throwWithStatus(409, 'This hotel stay is already checked out');
  }

  // Custom change (checkout gating): blocks checkout while the Boarding
  // Checklist still has actionable (Pending/In Progress) tasks - Missed
  // tasks don't block, see assertChecklistComplete's own docs.
  await assertChecklistComplete(stayId);

  const now = new Date();
  const days = payAtCheckout
    ? 0
    : extensionDays(stay.scheduled_check_out_date, now);
  // Looked up only when it can matter: a late day, or a pay-at-checkout
  // bill to reprice.
  const longStay =
    days > 0 || payAtCheckout
      ? await resolveBookingLongStayTerms(stay.booking_id, branchId)
      : null;
  const extensionRate =
    days > 0
      ? (longStay?.regularRate ??
        (await bookedNightlyRate(stay.booking_id, booking)) ??
        EXTENSION_FEE_PER_DAY)
      : EXTENSION_FEE_PER_DAY;
  const extensionFee = days > 0 ? days * extensionRate : null;

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

  if (payAtCheckout) {
    const checkInAt = new Date(stay.check_in_at);
    const nights = stayNights(checkInAt, now);
    const nightsLabel = `${nights} night${nights === 1 ? '' : 's'}`;

    try {
      const actualTotal = await repriceItemsForNights(
        stay.booking_id,
        booking,
        checkInAt,
        nights,
        longStay
      );
      const transaction = await postPayAtCheckoutCharge({
        bookingId: stay.booking_id,
        actualTotal,
        lineItem: {
          description: `Hotel stay (${nightsLabel})`,
          quantity: nights,
          unitPrice: round2(actualTotal / nights),
        },
        requesterId,
      });

      return {
        stay: updated as HotelStay,
        downpaymentAmount: 0,
        extensionFee: null,
        remainingBalance: Number(transaction?.total_amount ?? 0),
        payAtCheckout: { nights },
      };
    } catch (chargeError) {
      console.error(
        `checkOutHotelStay: failed to post the pay-at-checkout bill for booking ${stay.booking_id}:`,
        chargeError
      );
      throwWithStatus(
        500,
        `The pet was checked out, but the bill for ${nightsLabel} could not be sent to the cashier - please add it at the cashier manually`
      );
    }
  }

  // The booking's charges were created at booking time, so nothing else
  // would put the late fee on the cashier's Transactions list - post it now
  // (the same way Daycare posts its overdue fee). The checkout is already
  // saved, so a failure is reported as exactly that.
  if (extensionFee != null && extensionFee > 0) {
    try {
      await postCheckoutExtras({
        bookingId: stay.booking_id,
        lines: [
          {
            description: `Late checkout (${days} night${days === 1 ? '' : 's'} x ₱${extensionRate})`,
            quantity: days,
            unit_price: extensionRate,
            line_total: extensionFee,
            line_item_type: 'stay_extension',
          },
        ],
        requesterId,
      });
    } catch (chargeError) {
      console.error(
        `checkOutHotelStay: failed to post the late checkout fee for booking ${stay.booking_id}:`,
        chargeError
      );
      throwWithStatus(
        500,
        `The pet was checked out, but the ₱${extensionFee} late checkout fee could not be added to the bill - please add it at the cashier manually`
      );
    }
  }

  // What is still owed is read back off Transactions rather than worked out
  // here, so it always matches what the cashier sees (discounts, payments
  // already made and the fee just posted included).
  const groupId = booking.booking_group_id ?? null;
  const remainingBalance = await loadRemainingBalance(
    groupId ? null : stay.booking_id,
    groupId
  );

  return {
    stay: updated as HotelStay,
    downpaymentAmount: Number(updated.downpayment_amount),
    extensionFee,
    remainingBalance,
  };
}
