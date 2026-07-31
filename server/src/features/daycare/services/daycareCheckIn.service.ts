import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CheckInInput } from '../modules/validators/daycare.validator.ts';
import type { DaycareSession, DaycareStatus } from '../daycare.types.ts';
import { startBooking } from '../../booking/services/booking.service.ts';

/** Fixed per Modules-Features - not read from branches.daycare_checkin_cutoff
 * even though the column exists on every branch (#62 migration note); only
 * Southwoods' cutoff is ever actually configurable. */
const MAKATI_DAYCARE_CUTOFF = '16:00:00';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Mirrors unavailabilityBlock.service.ts's resolveShiftEnd timezone math -
 * resolves a branch-local HH:MM:SS cutoff into the equivalent UTC instant for
 * "today" in that branch's timezone. */
function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - date.getTime();
}

export function resolveCutoffInstant(
  timezone: string,
  cutoffTime: string,
  now: Date
): Date {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [hour, minute] = cutoffTime.split(':').map(Number);
  const naiveLocalMs = Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    hour,
    minute,
    0
  );

  const offsetMs = getTimezoneOffsetMs(timezone, now);

  return new Date(naiveLocalMs - offsetMs);
}

function formatCutoffForMessage(cutoffTime: string): string {
  const [hour, minute] = cutoffTime.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

interface CheckInParams {
  requesterId: string;
  input: CheckInInput;
}

/**
 * Issue #65: cutoff check runs before the check-in write, not after - if the
 * current time is past the branch's cutoff, no daycare_sessions row is
 * created at all (matching the flow diagram's blocked-END path exactly).
 */
export async function checkInDaycareSession({
  requesterId,
  input,
}: CheckInParams): Promise<DaycareSession> {
  let petId: string;
  let branchId: string;
  let bookingId: string | null = null;

  if (input.booking_id) {
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, pet_id, branch_id, service_category, status')
      .eq('id', input.booking_id)
      .maybeSingle();

    if (bookingError) throwWithStatus(400, bookingError.message);
    if (!booking) throwWithStatus(404, 'Booking not found');
    if (booking.service_category !== 'Daycare') {
      throwWithStatus(400, 'Booking is not a Daycare booking');
    }
    // Booking-status revision: there is no more separate Confirmed gate -
    // check-in itself is the "service started" event, so a booking may be
    // checked in only while it's still Pending (hasn't started yet).
    if (booking.status !== 'Pending') {
      throwWithStatus(409, `A ${booking.status} booking cannot be checked in`);
    }

    petId = booking.pet_id;
    branchId = booking.branch_id;
    bookingId = booking.id;
  } else {
    petId = input.pet_id!;
    branchId = input.branch_id!;
  }

  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('name, timezone, daycare_checkin_cutoff')
    .eq('id', branchId)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);
  if (!branch) throwWithStatus(404, 'Branch not found');

  const now = new Date();
  const cutoffTime =
    branch.name === 'Makati'
      ? MAKATI_DAYCARE_CUTOFF
      : branch.daycare_checkin_cutoff;
  const cutoffInstant = resolveCutoffInstant(branch.timezone, cutoffTime, now);

  if (now > cutoffInstant) {
    throwWithStatus(
      400,
      `Check-in unavailable after ${formatCutoffForMessage(cutoffTime)}`
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('daycare_sessions')
    .insert({
      booking_id: bookingId,
      pet_id: petId,
      branch_id: branchId,
      created_by_staff_id: requesterId,
      status: 'Active',
      check_in_at: now.toISOString(),
    })
    .select('*')
    .maybeSingle();

  if (insertError || !inserted) {
    throwWithStatus(
      400,
      insertError?.message ?? 'Failed to check in daycare session'
    );
  }

  // Booking-status revision: sync the linked booking to In Progress now that
  // the pet has physically checked in. Walk-ins (bookingId is null) have no
  // booking row to sync at all.
  if (bookingId) {
    await startBooking({ bookingId });
  }

  return inserted as DaycareSession;
}

interface ListDaycareSessionsParams {
  branchId: string;
  status?: DaycareStatus;
}

/** Mirrors hotelStay.service.ts's listHotelStays - backs Daycare Checkout's
 * search/filter/sort picker (Daycare had no "browse active sessions"
 * endpoint before this; checkout could only be reached with a known session
 * id). daycare_sessions carries branch_id directly, so unlike hotel_stays
 * this needs no join to resolve the branch scope. */
export async function listDaycareSessions({
  branchId,
  status,
}: ListDaycareSessionsParams): Promise<DaycareSession[]> {
  let query = supabase
    .from('daycare_sessions')
    .select('*')
    .eq('branch_id', branchId)
    .order('check_in_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as DaycareSession[];
}
