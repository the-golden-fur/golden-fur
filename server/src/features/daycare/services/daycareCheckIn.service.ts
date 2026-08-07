import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CheckInInput } from '../modules/validators/daycare.validator.ts';
import type { DaycareSession, DaycareStatus } from '../daycare.types.ts';
import { startBooking } from '../../booking/services/booking.service.ts';
import {
  resolveAndClaimCage,
  insertFeedingInstructions,
  insertWalkingInstructions,
  insertPlayingInstructions,
  insertMedicationInstructions,
  generateCareLogEntries,
} from '../../hotel/services/careInstructions.service.ts';
import { releaseCage } from '../../hotel/services/cageAssignment.service.ts';

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

/**
 * Custom change (Daycare fee configuration): "this fee itself is attached
 * to the service, not hardcoded to all daycare services" - checkout needs
 * to know which Daycare service's first_hour_fee/succeeding_hour_fee apply
 * to this session. Booking-linked check-ins derive it from the booking's
 * own selected service (single-select, per CustomerBookingFlowPage); a
 * walk-in either names one explicitly or falls back to the branch's first
 * active Daycare service. Returns null only if no Daycare service exists
 * at all at that branch (computeDaycareCharge then falls back to the
 * documented ₱100/₱50 defaults).
 */
async function resolveDaycareServiceId(
  branchId: string,
  bookingId: string | null,
  explicitServiceId?: string
): Promise<string | null> {
  if (bookingId) {
    const { data } = await supabase
      .from('booking_items')
      .select('service_id')
      .eq('booking_id', bookingId)
      .not('service_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (data?.service_id) return data.service_id as string;
  } else if (explicitServiceId) {
    return explicitServiceId;
  }

  const { data: fallback } = await supabase
    .from('services')
    .select('id, service_branch_availability!inner(branch_id, is_available)')
    .eq('category', 'Daycare')
    .eq('is_active', true)
    .eq('service_branch_availability.branch_id', branchId)
    .eq('service_branch_availability.is_available', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallback?.id as string | undefined) ?? null;
}

interface CheckInParams {
  requesterId: string;
  input: CheckInInput;
}

/**
 * Issue #65: cutoff check runs before the check-in write, not after - if the
 * current time is past the branch's cutoff, no `stays` row is created at
 * all (matching the flow diagram's blocked-END path exactly).
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

  // Custom change (Daycare/Hotel parity): Daycare now claims a real cage the
  // same way Hotel's check-in does (#75's suggestCage/assignCage, shared via
  // resolveAndClaimCage) - "it will also have cage config".
  const cage = await resolveAndClaimCage(petId, branchId, input.cage_id);
  const serviceId = await resolveDaycareServiceId(
    branchId,
    bookingId,
    input.service_id
  );

  try {
    const { data: inserted, error: insertError } = await supabase
      .from('stays')
      .insert({
        stay_type: 'Daycare',
        booking_id: bookingId,
        pet_id: petId,
        branch_id: branchId,
        cage_id: cage.id,
        service_id: serviceId,
        created_by_staff_id: requesterId,
        status: 'Active',
        check_in_at: now.toISOString(),
        notify_opt_in: input.notify_opt_in,
      })
      .select('*')
      .maybeSingle();

    if (insertError || !inserted) {
      throwWithStatus(
        400,
        insertError?.message ?? 'Failed to check in daycare session'
      );
    }

    // Booking-status revision: sync the linked booking to In Progress now
    // that the pet has physically checked in. Walk-ins (bookingId is null)
    // have no booking row to sync at all.
    if (bookingId) {
      await startBooking({ bookingId });
    }

    // Same structured feeding/walking/playing/medication instructions +
    // Care Log generation as Hotel check-in (#75/#76), reusing the exact
    // same shared helpers - "the only difference will be their services".
    // Daycare has no scheduled multi-night stay length (unlike Hotel), so
    // the Care Log is generated for today only.
    const checkInDate = now.toISOString().slice(0, 10);

    const feeding = await insertFeedingInstructions(inserted.id, input.feeding);
    const walking = await insertWalkingInstructions(inserted.id, input.walking);
    const playing = await insertPlayingInstructions(inserted.id, input.playing);
    const medications = await insertMedicationInstructions(
      inserted.id,
      petId,
      input.medications
    );

    await generateCareLogEntries(
      inserted.id,
      [checkInDate],
      feeding,
      walking,
      playing,
      medications
    );

    return inserted as DaycareSession;
  } catch (error) {
    await releaseCage(cage.id);
    throw error;
  }
}

interface ListDaycareSessionsParams {
  branchId: string;
  status?: DaycareStatus;
}

/** Mirrors hotelStay.service.ts's listHotelStays - backs Daycare Checkout's
 * search/filter/sort picker. `stays` carries branch_id directly, so this
 * needs no join to resolve the branch scope. */
export async function listDaycareSessions({
  branchId,
  status,
}: ListDaycareSessionsParams): Promise<DaycareSession[]> {
  let query = supabase
    .from('stays')
    .select('*')
    .eq('stay_type', 'Daycare')
    .eq('branch_id', branchId)
    .order('check_in_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as DaycareSession[];
}
