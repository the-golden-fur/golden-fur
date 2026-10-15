import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  DaycareChargeBreakdown,
  DaycareCheckoutPreview,
  DaycareCheckoutResult,
} from '../daycare.types.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import { listClosingTimesBetween } from '../../booking/services/availability.service.ts';
import {
  DAYCARE_OVERDUE_FEE_PER_HOUR,
  daycareHourlyCharge,
  daycareOverdueCharge,
} from '../modules/daycareCharge.util.ts';
import { assertChecklistComplete } from '../../hotel/services/careLogCompletion.service.ts';
import { recordActivity } from '../../hotel/services/activityLog.service.ts';
import { postDaycareOverdueCharge } from './daycareOverdueCharge.service.ts';
import { postPayAtCheckoutCharge } from '../../billing/services/payAtCheckoutCharge.service.ts';
import { loadRemainingBalance } from '../../billing/services/transactionPayment.service.ts';
import { resolveEffectivePolicy } from '../../booking/services/staffPicker.service.ts';
import { servicePriceAtBranch } from '../../maintenance/utils/branchServicePrice.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Documented fallback figures - used when a session has no resolvable
 * Daycare service (service_id is null, or that service's own fee columns
 * are null). Custom change (Daycare fee configuration): these used to be
 * the ONLY figures, hardcoded for every Daycare service; each service can
 * now set its own via services.first_hour_fee/succeeding_hour_fee/
 * daycare_overnight_fee. */
const DEFAULT_FIRST_HOUR_CHARGE = 100;
const DEFAULT_SUCCEEDING_HOUR_CHARGE = 50;
const DEFAULT_OVERNIGHT_CHARGE = 850;

/**
 * The nightly rate a not-picked-up Daycare pet is billed: the branch's own
 * Hotel service price. Hotel is one fixed-price service regardless of pet
 * or cage size (migration 20260807105 - cage size is a capacity concern
 * only, never a price input), so this takes neither; changing the Hotel
 * service's price in Admin > Services changes this with it. If a branch
 * ever has several active Hotel services the cheapest wins (deterministic,
 * never over-charges). `fallback` (the Daycare service's own
 * daycare_overnight_fee, or the documented default) only applies when the
 * branch has no active Hotel service at all, so checkout never fails here.
 */
async function resolveHotelNightlyRate(
  branchId: string,
  fallback: number
): Promise<number> {
  const { data, error } = await supabase
    .from('services')
    .select(
      'base_price, service_branch_availability!inner(branch_id, is_available, price_override)'
    )
    .eq('category', 'Hotel')
    .eq('is_active', true)
    .is('archived_at', null)
    .eq('service_branch_availability.branch_id', branchId)
    .eq('service_branch_availability.is_available', true);

  if (error) throwWithStatus(400, error.message);

  // The inner join above is already narrowed to this branch's own row, so
  // servicePriceAtBranch picks up the branch's own Hotel price if it has one.
  const prices = (
    (data ?? []) as Array<Parameters<typeof servicePriceAtBranch>[0]>
  ).map((row) => servicePriceAtBranch(row, branchId));

  return prices.length > 0 ? Math.min(...prices) : fallback;
}

/**
 * Picked up before closing: elapsed <= 1 hour -> flat firstHourFee,
 * otherwise firstHourFee + succeedingHourFee x each succeeding hour,
 * rounding any partial hour up to a full hour - e.g. 1h10m = 2 billable
 * hours (#65 dev notes' own worked example, PHP 100/50 defaults -> 150).
 *
 * Not picked up (the session spans one or more of the branch's closing
 * times): the hourly charge above stops at the FIRST closing time, and each
 * night spanned is billed at the Hotel nightly rate instead
 * (resolveHotelNightlyRate) - total = hourly charge up to closing + nights
 * x nightly rate. Nothing is charged hourly overnight or the next morning.
 * This replaced the original #22 rule (a flat per-service overnight fee on
 * top of an hourly charge that kept running until actual pickup);
 * `fallbackOvernightFee` is that old per-service fee, now only the fallback
 * for a branch with no Hotel service.
 *
 * Overdue checkout: when the session has a booked end time
 * (`expectedCheckoutAt` - the booking's scheduled_end; null for a walk-in),
 * the normal hourly charge above stops there too, and the time from the
 * booked end up to pickup (or the first closing time, whichever is first) is
 * billed by daycareOverdueCharge instead - a flat fee per overdue hour after
 * a grace period, never both rates for the same hour.
 *
 * Pay at checkout (`graceMinutes` - policy_configurations
 * .pay_at_checkout_grace_minutes): such a stay has no booked end to be
 * overdue against (its caller passes `expectedCheckoutAt` null), so its only
 * leniency is on the hourly rounding itself - see daycareHourlyCharge. It
 * does not move the closing time: a pet still here at closing is billed the
 * night.
 *
 * Note for the reviewer: the Guide's AC-4 table claims 2h15m -> PHP 250 ("3
 * billable succeeding hours"), which does not follow from this same formula
 * (2h15m -> 1h15m past the first hour -> ceil(1.25) = 2 succeeding hours ->
 * PHP 200) or from the dev notes' own 1h10m example. PHP 200 is what this
 * implementation computes; see the verification doc for the full note.
 */
export async function computeDaycareChargeBreakdown(
  checkInAt: Date,
  checkOutAt: Date,
  branchId: string,
  firstHourFee: number = DEFAULT_FIRST_HOUR_CHARGE,
  succeedingHourFee: number = DEFAULT_SUCCEEDING_HOUR_CHARGE,
  fallbackOvernightFee: number = DEFAULT_OVERNIGHT_CHARGE,
  expectedCheckoutAt: Date | null = null,
  graceMinutes: number = 0
): Promise<DaycareChargeBreakdown> {
  const closings = await listClosingTimesBetween(
    checkInAt,
    checkOutAt,
    branchId
  );
  const nights = closings.length;
  const hourlyEnd = closings[0] ?? checkOutAt;

  // Only a booked end time that falls inside the stay splits it; a pet
  // checked in after its booked window already ended is billed as before.
  const bookedEnd =
    expectedCheckoutAt !== null &&
    expectedCheckoutAt.getTime() > checkInAt.getTime() &&
    expectedCheckoutAt.getTime() < hourlyEnd.getTime()
      ? expectedCheckoutAt
      : null;
  const normalEnd = bookedEnd ?? hourlyEnd;

  const { succeedingHours, charge: hourlyCharge } = daycareHourlyCharge(
    (normalEnd.getTime() - checkInAt.getTime()) / 60000,
    firstHourFee,
    succeedingHourFee,
    graceMinutes
  );

  const { overdueHours, charge: overdueCharge } = daycareOverdueCharge(
    bookedEnd === null ? 0 : (hourlyEnd.getTime() - bookedEnd.getTime()) / 60000
  );

  const nightlyRate =
    nights > 0
      ? await resolveHotelNightlyRate(branchId, fallbackOvernightFee)
      : null;
  const overnightCharge = nightlyRate === null ? 0 : nights * nightlyRate;

  return {
    first_hour_fee: firstHourFee,
    succeeding_hours: succeedingHours,
    succeeding_hour_fee: succeedingHourFee,
    hourly_charge: hourlyCharge,
    overdue_hours: overdueHours,
    overdue_hour_fee: DAYCARE_OVERDUE_FEE_PER_HOUR,
    overdue_charge: overdueCharge,
    nights,
    nightly_rate: nightlyRate,
    overnight_charge: overnightCharge,
    total: hourlyCharge + overdueCharge + overnightCharge,
  };
}

/** Just the total of computeDaycareChargeBreakdown. */
export async function computeDaycareCharge(
  checkInAt: Date,
  checkOutAt: Date,
  branchId: string,
  firstHourFee: number = DEFAULT_FIRST_HOUR_CHARGE,
  succeedingHourFee: number = DEFAULT_SUCCEEDING_HOUR_CHARGE,
  fallbackOvernightFee: number = DEFAULT_OVERNIGHT_CHARGE
): Promise<number> {
  const breakdown = await computeDaycareChargeBreakdown(
    checkInAt,
    checkOutAt,
    branchId,
    firstHourFee,
    succeedingHourFee,
    fallbackOvernightFee
  );

  return breakdown.total;
}

/** Resolves a session's own Daycare service fee schedule, falling back to
 * the documented defaults when the session has no service_id (a stay from
 * before this column existed) or that service left a fee column unset. */
async function resolveDaycareFeeSchedule(serviceId: string | null): Promise<{
  firstHourFee: number;
  succeedingHourFee: number;
  dailyOvernightFee: number;
}> {
  if (!serviceId) {
    return {
      firstHourFee: DEFAULT_FIRST_HOUR_CHARGE,
      succeedingHourFee: DEFAULT_SUCCEEDING_HOUR_CHARGE,
      dailyOvernightFee: DEFAULT_OVERNIGHT_CHARGE,
    };
  }

  const { data } = await supabase
    .from('services')
    .select('first_hour_fee, succeeding_hour_fee, daycare_overnight_fee')
    .eq('id', serviceId)
    .maybeSingle();

  return {
    firstHourFee:
      data?.first_hour_fee != null
        ? Number(data.first_hour_fee)
        : DEFAULT_FIRST_HOUR_CHARGE,
    succeedingHourFee:
      data?.succeeding_hour_fee != null
        ? Number(data.succeeding_hour_fee)
        : DEFAULT_SUCCEEDING_HOUR_CHARGE,
    dailyOvernightFee:
      data?.daycare_overnight_fee != null
        ? Number(data.daycare_overnight_fee)
        : DEFAULT_OVERNIGHT_CHARGE,
  };
}

/** What checkout needs from the session's booking: its scheduled_end - when
 * the pet was booked to be picked up - and whether it is billed at checkout.
 * A session with no booking has no agreed pickup time, so no overdue fee;
 * neither does a pay-at-checkout booking, whose end time was only an
 * estimate. */
async function resolveBookingBillingTerms(bookingId: string | null): Promise<{
  expectedCheckoutAt: Date | null;
  payAtCheckout: boolean;
  bookingGroupId: string | null;
}> {
  if (!bookingId) {
    return {
      expectedCheckoutAt: null,
      payAtCheckout: false,
      bookingGroupId: null,
    };
  }

  const { data } = await supabase
    .from('bookings')
    .select('scheduled_end, pay_at_checkout, booking_group_id')
    .eq('id', bookingId)
    .maybeSingle();

  const payAtCheckout = data?.pay_at_checkout === true;

  return {
    expectedCheckoutAt:
      !payAtCheckout && data?.scheduled_end
        ? new Date(data.scheduled_end)
        : null,
    payAtCheckout,
    bookingGroupId: data?.booking_group_id ?? null,
  };
}

/**
 * What the booking was charged, at booking time, for its Daycare hours - the
 * price on its own Daycare item. Null when the booking has no item to read
 * it from, in which case checkout has nothing to compare the hours against.
 */
async function resolveBookedDaycareCharge(
  bookingId: string,
  serviceId: string | null
): Promise<number | null> {
  const { data: itemRows, error: itemsError } = await supabase
    .from('booking_items')
    .select('id, service_id, price_at_booking')
    .eq('booking_id', bookingId);

  if (itemsError) throwWithStatus(400, itemsError.message);

  const items = (itemRows ?? []) as Array<{
    service_id: string | null;
    price_at_booking: number;
  }>;
  const daycareItem =
    items.find((item) => item.service_id === serviceId) ?? items[0];

  return daycareItem ? Number(daycareItem.price_at_booking) : null;
}

/**
 * Pay at checkout: the booking was created with no charge and only an
 * estimated price. Writes the actual Daycare charge onto the booking's own
 * Daycare item (leaving any other item as booked) and posts the resulting
 * total to the cashier's Transactions list.
 */
async function postPayAtCheckoutBill(
  bookingId: string,
  serviceId: string | null,
  breakdown: DaycareChargeBreakdown,
  requesterId?: string
): Promise<void> {
  const { data: itemRows, error: itemsError } = await supabase
    .from('booking_items')
    .select('id, service_id, price_at_booking')
    .eq('booking_id', bookingId);

  if (itemsError) throwWithStatus(400, itemsError.message);

  const items = (itemRows ?? []) as Array<{
    id: string;
    service_id: string | null;
    price_at_booking: number;
  }>;
  const daycareItem =
    items.find((item) => item.service_id === serviceId) ?? items[0];

  if (daycareItem) {
    const { error: updateItemError } = await supabase
      .from('booking_items')
      .update({ price_at_booking: breakdown.total })
      .eq('id', daycareItem.id);

    if (updateItemError) throwWithStatus(400, updateItemError.message);
  }

  const actualTotal = items.reduce(
    (sum, item) =>
      item.id === daycareItem?.id ? sum : sum + Number(item.price_at_booking),
    breakdown.total
  );
  const hours = 1 + breakdown.succeeding_hours;

  await postPayAtCheckoutCharge({
    bookingId,
    actualTotal,
    lineItem: {
      description: `Daycare (${[
        `${hours} hour${hours === 1 ? '' : 's'}`,
        ...(breakdown.nights > 0
          ? [
              `${breakdown.nights} night${breakdown.nights === 1 ? '' : 's'} not picked up`,
            ]
          : []),
      ].join(', ')})`,
      quantity: 1,
      unitPrice: actualTotal,
    },
    requesterId,
  });
}

interface DaycareSessionRow {
  id: string;
  booking_id: string | null;
  branch_id: string;
  service_id?: string | null;
  check_in_at: string;
}

/**
 * The Daycare bill for a session checked out at `at`: the itemized charge
 * plus the booking terms that decide how it is posted. Shared by checkout
 * and its preview, so what staff are shown before checking a pet out is
 * exactly what checkout then charges.
 */
async function buildDaycareBill(
  session: DaycareSessionRow,
  at: Date
): Promise<{
  breakdown: DaycareChargeBreakdown;
  payAtCheckout: boolean;
  bookingGroupId: string | null;
}> {
  const { firstHourFee, succeedingHourFee, dailyOvernightFee } =
    await resolveDaycareFeeSchedule(session.service_id ?? null);
  const { expectedCheckoutAt, payAtCheckout, bookingGroupId } =
    await resolveBookingBillingTerms(session.booking_id);
  const graceMinutes = payAtCheckout
    ? (await resolveEffectivePolicy(session.branch_id))
        .pay_at_checkout_grace_minutes
    : 0;
  const breakdown = await computeDaycareChargeBreakdown(
    new Date(session.check_in_at),
    at,
    session.branch_id,
    firstHourFee,
    succeedingHourFee,
    dailyOvernightFee,
    expectedCheckoutAt,
    graceMinutes
  );

  return { breakdown, payAtCheckout, bookingGroupId };
}

/** What a normal (not pay-at-checkout) booking's checkout adds on top of
 * what was charged at booking: hours beyond those booked (never negative - a
 * pet picked up early is not refunded here), the overdue fee and any night
 * not picked up. */
function daycareCheckoutExtras(
  breakdown: DaycareChargeBreakdown,
  bookedCharge: number | null
): { additionalHoursCharge: number; total: number } {
  const additionalHoursCharge =
    bookedCharge === null
      ? 0
      : Math.max(0, breakdown.hourly_charge - bookedCharge);

  return {
    additionalHoursCharge,
    total:
      additionalHoursCharge +
      breakdown.overdue_charge +
      breakdown.overnight_charge,
  };
}

/**
 * The bill a Daycare session would get if it were checked out right now -
 * shown in the check-out confirmation so staff see every line (booked hours,
 * overdue hours, nights not picked up) before confirming. Writes nothing.
 * For a booked session, amount_due is what Transactions would then say is
 * owed: what is already pending plus the extras checkout would post.
 */
export async function previewDaycareCheckout(
  sessionId: string
): Promise<DaycareCheckoutPreview> {
  const { data: session, error } = await supabase
    .from('stays')
    .select('*')
    .eq('id', sessionId)
    .eq('stay_type', 'Daycare')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!session) throwWithStatus(404, 'Daycare session not found');
  if (session.status === 'Completed') {
    throwWithStatus(409, 'This daycare session is already checked out');
  }

  const now = new Date();
  const { breakdown, payAtCheckout, bookingGroupId } = await buildDaycareBill(
    session as DaycareSessionRow,
    now
  );

  let bookedCharge: number | null = null;
  let addedAtCheckout: number | null = null;
  let amountDue: number | null = null;

  if (session.booking_id && !payAtCheckout) {
    bookedCharge = await resolveBookedDaycareCharge(
      session.booking_id,
      session.service_id ?? null
    );
    addedAtCheckout = daycareCheckoutExtras(breakdown, bookedCharge).total;
    amountDue =
      (await loadRemainingBalance(
        bookingGroupId ? null : session.booking_id,
        bookingGroupId
      )) + addedAtCheckout;
  }

  return {
    charge_breakdown: breakdown,
    computed_charge: breakdown.total,
    booked_charge: bookedCharge,
    added_at_checkout: addedAtCheckout,
    amount_due: amountDue,
    billed_at_checkout: payAtCheckout,
    as_of: now.toISOString(),
  };
}

interface CheckOutParams {
  sessionId: string;
  /** Custom change (activity logbook): who performed the checkout - optional
   * so existing call sites/tests keep working unchanged. */
  requesterId?: string;
}

/**
 * Issue #65: checkout sets status = 'Completed' and computed_charge together,
 * atomically, so a session can never be marked Completed without a stored
 * charge. No real billing call is made - computed_charge is simply stored
 * and queryable.
 * TODO(Sprint 5, M08): post computed_charge as a real transaction line item
 * once M08 exists.
 *
 * Custom change (pay at checkout, 20261005244): for a booking created with
 * bookings.pay_at_checkout that posting does happen - the booking has no
 * charge yet, so computed_charge (hours since check-in at the normal rate,
 * with the branch's grace period and no overdue fee) becomes its bill
 * (postPayAtCheckoutBill).
 */
export async function checkOutDaycareSession({
  sessionId,
  requesterId,
}: CheckOutParams): Promise<DaycareCheckoutResult> {
  const { data: session, error } = await supabase
    .from('stays')
    .select('*')
    .eq('id', sessionId)
    .eq('stay_type', 'Daycare')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!session) throwWithStatus(404, 'Daycare session not found');
  if (session.status === 'Completed') {
    throwWithStatus(409, 'This daycare session is already checked out');
  }

  // Custom change (checkout gating): Daycare shares the same stays/
  // care_log_entries tables as Hotel, so the same Boarding Checklist gate
  // applies here - see checkout.service.ts's checkOutHotelStay and
  // assertChecklistComplete's own docs.
  await assertChecklistComplete(sessionId);

  const now = new Date();
  const { breakdown, payAtCheckout, bookingGroupId } = await buildDaycareBill(
    session as DaycareSessionRow,
    now
  );
  const charge = breakdown.total;

  const { data: updated, error: updateError } = await supabase
    .from('stays')
    .update({
      status: 'Completed',
      actual_check_out_at: now.toISOString(),
      computed_charge: charge,
      // The overdue part of computed_charge, kept on its own so billing can
      // itemize it (lineItemSources.service.ts). NULL, never zero, when no
      // overdue fee applied - same convention as Hotel's own extension_fee.
      extension_fee:
        breakdown.overdue_charge > 0 ? breakdown.overdue_charge : null,
      updated_at: now.toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to check out daycare session'
    );
  }

  // Custom change (Daycare/Hotel parity): Daycare now holds a real cage
  // (claimed at check-in via resolveAndClaimCage), so checkout must release
  // it back to Available - mirrors checkOutHotelStay's identical step.
  await supabase
    .from('cages')
    .update({ status: 'Available', updated_at: now.toISOString() })
    .eq('id', session.cage_id);

  // What this checkout added to the booking's Transactions (a normal
  // booking's late extras), and what its Daycare hours were charged at
  // booking - both null when there is nothing to compare against.
  let addedAtCheckout: number | null = null;
  let bookedChargeAtBooking: number | null = null;

  // Booking-status revision: sync the linked booking to Completed/Paid now
  // that checkout happened. Walk-ins (booking_id is null) have no booking
  // row to sync at all.
  //
  // Every booking-linked check-in calls startBooking (daycareCheckIn.service
  // .ts), so the linked booking should always be In Progress by the time
  // checkout runs. The one edge case where that wouldn't hold is if the
  // booking was independently cancelled in the meantime -
  // CANCELLABLE_BOOKING_STATUSES includes 'In Progress', so a booking-side
  // cancellation action (outside daycare's control) could flip it to
  // Cancelled between check-in and checkout. completeBooking would then
  // throw a 409 ("A Cancelled booking cannot be completed"). By this point
  // the stays row is already durably Completed - that's the
  // authoritative record that the physical checkout happened - so we don't
  // let a stale/cancelled booking's 409 block this response; we just skip
  // the sync for that one status-mismatch case and let any other error
  // propagate normally.
  if (session.booking_id) {
    try {
      await completeBooking({ bookingId: session.booking_id });
    } catch (syncError) {
      if ((syncError as { statusCode?: number }).statusCode !== 409) {
        throw syncError;
      }
    }

    // The booking's charges were created at booking time from the hours
    // booked, so nothing else would ever put what checkout adds on top -
    // hours beyond those booked (e.g. an early check-in), the overdue fee and
    // any night(s) not picked up - on the cashier's Transactions list: post
    // it there now, so the booking's transactions add up to computed_charge.
    // By this point the checkout itself is already saved, so a failure here
    // is reported as exactly that rather than as a failed checkout.
    if (payAtCheckout) {
      try {
        await postPayAtCheckoutBill(
          session.booking_id,
          session.service_id ?? null,
          breakdown,
          requesterId
        );
      } catch (billError) {
        console.error(
          `checkOutDaycareSession: failed to post the pay-at-checkout bill for booking ${session.booking_id}:`,
          billError
        );
        throwWithStatus(
          500,
          `The pet was checked out, but the ₱${charge} bill could not be sent to the cashier - please add it at the cashier manually`
        );
      }
    } else {
      let additionalHoursCharge = 0;
      let lateChargesTotal =
        breakdown.overdue_charge + breakdown.overnight_charge;

      try {
        bookedChargeAtBooking = await resolveBookedDaycareCharge(
          session.booking_id,
          session.service_id ?? null
        );
        const extras = daycareCheckoutExtras(breakdown, bookedChargeAtBooking);
        additionalHoursCharge = extras.additionalHoursCharge;
        lateChargesTotal = extras.total;
        addedAtCheckout = lateChargesTotal;

        if (lateChargesTotal > 0) {
          await postDaycareOverdueCharge({
            bookingId: session.booking_id,
            overdueHours: breakdown.overdue_hours,
            overdueFee: breakdown.overdue_charge,
            additionalHours:
              additionalHoursCharge > 0
                ? { charge: additionalHoursCharge }
                : undefined,
            overnight:
              breakdown.overnight_charge > 0 && breakdown.nightly_rate !== null
                ? {
                    nights: breakdown.nights,
                    nightlyRate: breakdown.nightly_rate,
                    charge: breakdown.overnight_charge,
                  }
                : undefined,
            requesterId,
          });
        }
      } catch (chargeError) {
        console.error(
          `checkOutDaycareSession: failed to post the late checkout charges for booking ${session.booking_id}:`,
          chargeError
        );
        throwWithStatus(
          500,
          breakdown.overnight_charge > 0 || additionalHoursCharge > 0
            ? `The pet was checked out, but the ₱${lateChargesTotal} in extra checkout charges could not be added to the bill - please add it at the cashier manually`
            : `The pet was checked out, but the ₱${breakdown.overdue_charge} overdue checkout fee could not be added to the bill - please add it at the cashier manually`
        );
      }
    }
  }

  await recordActivity({
    branchId: session.branch_id,
    stayId: sessionId,
    action: 'check_out',
    actorStaffId: requesterId,
    description: `Checked out of a Daycare session (${[
      `₱${charge} charge`,
      ...(breakdown.overdue_hours > 0
        ? [`₱${breakdown.overdue_charge} overdue checkout fee`]
        : []),
      ...(breakdown.nights > 0
        ? [
            `${breakdown.nights} night${breakdown.nights === 1 ? '' : 's'} not picked up`,
          ]
        : []),
    ].join(', ')})`,
  });

  // What is still owed is read back off Transactions, so the checkout screen
  // shows the same figure the cashier will collect - computed_charge is the
  // whole session, most of which a normal booking already paid at booking.
  // A walk-in has no booking, so no Transactions to read.
  const amountDue = session.booking_id
    ? await loadRemainingBalance(
        bookingGroupId ? null : session.booking_id,
        bookingGroupId
      )
    : null;

  return {
    ...updated,
    charge_breakdown: breakdown,
    billed_at_checkout: payAtCheckout,
    added_at_checkout: addedAtCheckout,
    booked_charge: bookedChargeAtBooking,
    amount_due: amountDue,
  } as DaycareCheckoutResult;
}
