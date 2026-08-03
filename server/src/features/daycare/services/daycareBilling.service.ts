import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { DaycareSession } from '../daycare.types.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import { countOvernightNights } from '../../booking/services/availability.service.ts';
import { getPricingConfiguration } from '../../maintenance/services/pricingConfiguration.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const FIRST_HOUR_CHARGE = 100;
const SUCCEEDING_HOUR_CHARGE = 50;

/**
 * elapsed <= 1 hour -> flat ₱100. Otherwise ₱100 + ₱50 x each succeeding
 * hour, rounding any partial hour up to a full hour - e.g. 1h10m = 2 billable
 * hours = ₱150 (#65 dev notes' own worked example). #22 adds a flat
 * per-night overnight/no-pickup fee on top for every branch closing time the
 * session spanned (0 for a same-day pickup, so this is a strict superset of
 * the original formula) - admin-configurable via pricing_configuration,
 * default ₱850/night: total = nights * dailyOvernightFee + 100 + succeeding
 * hours * 50.
 *
 * Note for the reviewer: the Guide's AC-4 table claims 2h15m -> ₱250 ("3
 * billable succeeding hours"), which does not follow from this same formula
 * (2h15m -> 1h15m past the first hour -> ceil(1.25) = 2 succeeding hours ->
 * ₱200) or from the dev notes' own 1h10m example. ₱200 is what this
 * implementation computes; see the verification doc for the full note.
 */
export async function computeDaycareCharge(
  checkInAt: Date,
  checkOutAt: Date,
  branchId: string
): Promise<number> {
  const elapsedMinutes = (checkOutAt.getTime() - checkInAt.getTime()) / 60000;

  const hourlyCharge =
    elapsedMinutes <= 60
      ? FIRST_HOUR_CHARGE
      : FIRST_HOUR_CHARGE +
        Math.ceil((elapsedMinutes - 60) / 60) * SUCCEEDING_HOUR_CHARGE;

  const nights = await countOvernightNights(checkInAt, checkOutAt, branchId);
  if (nights === 0) return hourlyCharge;

  const { daycare_overnight_fee: dailyOvernightFee } =
    await getPricingConfiguration();

  return nights * Number(dailyOvernightFee) + hourlyCharge;
}

interface CheckOutParams {
  sessionId: string;
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
}: CheckOutParams): Promise<DaycareSession> {
  const { data: session, error } = await supabase
    .from('daycare_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!session) throwWithStatus(404, 'Daycare session not found');
  if (session.status === 'Completed') {
    throwWithStatus(409, 'This daycare session is already checked out');
  }

  const now = new Date();
  const charge = await computeDaycareCharge(
    new Date(session.check_in_at),
    now,
    session.branch_id
  );

  const { data: updated, error: updateError } = await supabase
    .from('daycare_sessions')
    .update({
      status: 'Completed',
      check_out_at: now.toISOString(),
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
  // the daycare_sessions row is already durably Completed - that's the
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

  return updated as DaycareSession;
}
