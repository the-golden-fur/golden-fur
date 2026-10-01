import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  DaycareChargeBreakdown,
  DaycareCheckoutResult,
} from '../daycare.types.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import { listClosingTimesBetween } from '../../booking/services/availability.service.ts';
import { daycareHourlyCharge } from '../modules/daycareCharge.util.ts';
import { assertChecklistComplete } from '../../hotel/services/careLogCompletion.service.ts';
import { recordActivity } from '../../hotel/services/activityLog.service.ts';

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
      'base_price, service_branch_availability!inner(branch_id, is_available)'
    )
    .eq('category', 'Hotel')
    .eq('is_active', true)
    .is('archived_at', null)
    .eq('service_branch_availability.branch_id', branchId)
    .eq('service_branch_availability.is_available', true);

  if (error) throwWithStatus(400, error.message);

  const prices = ((data ?? []) as Array<{ base_price: number }>).map((row) =>
    Number(row.base_price)
  );

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
  fallbackOvernightFee: number = DEFAULT_OVERNIGHT_CHARGE
): Promise<DaycareChargeBreakdown> {
  const closings = await listClosingTimesBetween(
    checkInAt,
    checkOutAt,
    branchId
  );
  const nights = closings.length;
  const hourlyEnd = closings[0] ?? checkOutAt;

  const { succeedingHours, charge: hourlyCharge } = daycareHourlyCharge(
    (hourlyEnd.getTime() - checkInAt.getTime()) / 60000,
    firstHourFee,
    succeedingHourFee
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
    nights,
    nightly_rate: nightlyRate,
    overnight_charge: overnightCharge,
    total: hourlyCharge + overnightCharge,
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
  const { firstHourFee, succeedingHourFee, dailyOvernightFee } =
    await resolveDaycareFeeSchedule(session.service_id);
  const breakdown = await computeDaycareChargeBreakdown(
    new Date(session.check_in_at),
    now,
    session.branch_id,
    firstHourFee,
    succeedingHourFee,
    dailyOvernightFee
  );
  const charge = breakdown.total;

  const { data: updated, error: updateError } = await supabase
    .from('stays')
    .update({
      status: 'Completed',
      actual_check_out_at: now.toISOString(),
      computed_charge: charge,
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
  }

  await recordActivity({
    branchId: session.branch_id,
    stayId: sessionId,
    action: 'check_out',
    actorStaffId: requesterId,
    description:
      breakdown.nights > 0
        ? `Checked out of a Daycare session (₱${charge} charge, ${breakdown.nights} night${breakdown.nights === 1 ? '' : 's'} not picked up)`
        : `Checked out of a Daycare session (₱${charge} charge)`,
  });

  return { ...updated, charge_breakdown: breakdown } as DaycareCheckoutResult;
}
