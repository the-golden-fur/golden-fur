import { supabase } from '../../../config/supabase/supabase.config.ts';
import { startBooking } from '../../booking/services/booking.service.ts';
import { getCurrentPrescription } from '../../veterinary/services/currentPrescription.service.ts';
import {
  assignCage,
  releaseCage,
  suggestCage,
} from './cageAssignment.service.ts';
import { recordActivity } from './activityLog.service.ts';
import type { CheckInInput } from '../modules/validators/hotel.validator.ts';
import type {
  CareFeedingInstruction,
  CareLogEntry,
  CareMedicationInstruction,
  CarePlayingInstruction,
  CareWalkingInstruction,
  CheckInResult,
  HotelStay,
  MealTime,
} from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Inclusive day range between two ISO (YYYY-MM-DD) dates, driving one-row-
 * per-scheduled-action-per-day Care Log generation (#75 dev notes). */
export function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

interface CheckInParams {
  requesterId: string;
  branchId: string;
  input: CheckInInput;
}

/**
 * Issue #75: single check-in flow - validates the booking, resolves/claims
 * a cage, writes the three care_*_instructions tables, and auto-generates
 * one care_log_entries row per scheduled action per day of the stay. Not a
 * real DB transaction (supabase-js has none available here) - a failure
 * after the cage claim releases it back to Available (see
 * cageAssignment.service.ts's releaseCage) so a failed check-in never
 * strands a cage as Occupied with no hotel_stays row behind it.
 */
export async function checkInHotelStay({
  requesterId,
  branchId,
  input,
}: CheckInParams): Promise<CheckInResult> {
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(
      'id, pet_id, branch_id, scheduled_end, service_category, status, downpayment_amount'
    )
    .eq('id', input.booking_id)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!booking) throwWithStatus(404, 'Booking not found');
  if (booking.service_category !== 'Hotel') {
    throwWithStatus(400, 'Booking is not a Hotel booking');
  }
  if (booking.status !== 'Pending') {
    throwWithStatus(409, `A ${booking.status} booking cannot be checked in`);
  }
  if (booking.branch_id !== branchId) {
    throwWithStatus(403, 'Booking does not belong to your branch');
  }

  const { data: existingStay, error: existingError } = await supabase
    .from('stays')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (existingError) throwWithStatus(400, existingError.message);
  if (existingStay) {
    throwWithStatus(409, 'This booking has already been checked in');
  }

  const cage = await resolveAndClaimCage(
    booking.pet_id,
    branchId,
    input.cage_id
  );

  try {
    const now = new Date();
    const scheduledCheckOutDate = String(booking.scheduled_end).slice(0, 10);

    const { data: stay, error: stayError } = await supabase
      .from('stays')
      .insert({
        stay_type: 'Hotel',
        booking_id: booking.id,
        pet_id: booking.pet_id,
        branch_id: branchId,
        cage_id: cage.id,
        check_in_at: now.toISOString(),
        scheduled_check_out_date: scheduledCheckOutDate,
        downpayment_amount: booking.downpayment_amount ?? 0,
        notify_opt_in: input.notify_opt_in,
        created_by_staff_id: requesterId,
      })
      .select('*')
      .maybeSingle();

    if (stayError || !stay) {
      throwWithStatus(400, stayError?.message ?? 'Failed to create hotel stay');
    }

    // Booking-status revision: physical check-in IS the "the service began"
    // trigger for a Hotel booking - advance Pending -> In Progress now that
    // the stays row (and the cage claim behind it) exist. Still inside
    // the try/catch above, so a failure here (e.g. an unexpected concurrent
    // status change) releases the cage exactly like any other failure past
    // the claim - it never strands an Occupied cage.
    await startBooking({ bookingId: booking.id });

    const checkInDate = now.toISOString().slice(0, 10);
    const days = enumerateDates(checkInDate, scheduledCheckOutDate);

    const feeding = await insertFeedingInstructions(stay.id, input.feeding);
    const walking = await insertWalkingInstructions(stay.id, input.walking);
    const playing = await insertPlayingInstructions(stay.id, input.playing);
    const medications = await insertMedicationInstructions(
      stay.id,
      booking.pet_id,
      input.medications
    );

    const careLogEntries = await generateCareLogEntries(
      stay.id,
      days,
      feeding,
      walking,
      playing,
      medications
    );

    await recordActivity({
      branchId,
      stayId: stay.id,
      action: 'check_in',
      actorStaffId: requesterId,
      description: 'Checked in for a Hotel stay',
    });

    return {
      stay: stay as HotelStay,
      feeding,
      walking,
      playing,
      medications,
      careLogEntries,
    };
  } catch (error) {
    await releaseCage(cage.id);
    throw error;
  }
}

/** Shared by Hotel and Daycare check-in: accepts an explicit cage_id
 * override, else auto-suggests the pet's weight-class cage and claims the
 * first available one - identical to Hotel's original inline logic
 * (#75), extracted so daycareCheckIn.service.ts can reuse it verbatim. */
export async function resolveAndClaimCage(
  petId: string,
  branchId: string,
  cageIdOverride?: string
) {
  let cageId = cageIdOverride;

  if (!cageId) {
    const suggestion = await suggestCage(petId, branchId);
    cageId = suggestion.availableCages[0]?.id;

    if (!cageId) {
      throwWithStatus(
        409,
        `No available cage of the suggested size (${suggestion.suggestedSize})`
      );
    }
  }

  return assignCage(cageId, branchId);
}

export async function insertFeedingInstructions(
  stayId: string,
  rows: CheckInInput['feeding']
): Promise<CareFeedingInstruction[]> {
  if (rows.length === 0) return [];

  const preparedRows = rows.map((row) => ({
    meal_time: row.meal_time,
    food_type: row.food_type,
    quantity: row.quantity,
    special_instructions: row.special_instructions,
    food_catalog_id: row.food_catalog_id ?? null,
    stay_date: row.stay_date ?? null,
    stay_id: stayId,
  }));

  const { data, error } = await supabase
    .from('care_feeding_instructions')
    .insert(preparedRows)
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareFeedingInstruction[];
}

export async function insertWalkingInstructions(
  stayId: string,
  rows: CheckInInput['walking']
): Promise<CareWalkingInstruction[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('care_walking_instructions')
    .insert(rows.map((row) => ({ ...row, stay_id: stayId })))
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareWalkingInstruction[];
}

export async function insertPlayingInstructions(
  stayId: string,
  rows: CheckInInput['playing']
): Promise<CarePlayingInstruction[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('care_playing_instructions')
    .insert(rows.map((row) => ({ ...row, stay_id: stayId })))
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CarePlayingInstruction[];
}

/**
 * #75 AC-3: when the request omits `medications` entirely, auto-fills from
 * M07's current-prescription derivation (empty when no current prescription
 * exists); when the request provides the field (including `[]`), it is used
 * verbatim as the receptionist's own list, with no source note attached -
 * only genuinely M07-derived rows carry source_prescription_note.
 */
export async function insertMedicationInstructions(
  stayId: string,
  petId: string,
  requested: CheckInInput['medications']
): Promise<CareMedicationInstruction[]> {
  let rows: Array<{
    medication_name: string;
    dose: string;
    scheduled_times: string[];
    administration_notes?: string;
    source_prescription_note?: string;
    medication_catalog_id?: string;
    stay_date?: string;
  }>;

  if (requested !== undefined) {
    rows = requested;
  } else {
    const prescription = await getCurrentPrescription(petId);
    rows = (prescription?.medications ?? []).map((medication) => ({
      medication_name: medication.name,
      dose: medication.dose,
      scheduled_times: [],
      administration_notes: medication.notes ?? undefined,
      source_prescription_note: `Pre-filled from consultation ${prescription!.consultation_id} completed ${prescription!.completed_at}`,
    }));
  }

  if (rows.length === 0) return [];

  const preparedRows = rows.map((row) => ({
    medication_name: row.medication_name,
    dose: row.dose,
    scheduled_times: row.scheduled_times,
    administration_notes: row.administration_notes,
    source_prescription_note: row.source_prescription_note,
    medication_catalog_id: row.medication_catalog_id ?? null,
    stay_date: row.stay_date ?? null,
    stay_id: stayId,
  }));

  const { data, error } = await supabase
    .from('care_medication_instructions')
    .insert(preparedRows)
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareMedicationInstruction[];
}

/** A row with stay_date === null applies to every night; a dated row applies
 * only to that night. When both a dated row and a null-dated row would
 * otherwise both fire for the same date, the dated one wins (matches "same
 * instructions every night, except this one day I overrode" intent). #22 */
function rowsForDate<T extends { stay_date: string | null }>(
  rows: T[],
  date: string
): T[] {
  const dated = rows.filter((row) => row.stay_date === date);
  if (dated.length > 0) return dated;
  return rows.filter((row) => row.stay_date == null);
}

/** Buckets a medication's "HH:MM" scheduled time into the same Morning/
 * Noon/Afternoon/Evening vocabulary feeding/walking/playing already use, so
 * every care_type can be grouped by time-of-day consistently on the
 * Boarding Checklist. `null` for the 'as scheduled' fallback (no real time
 * to bucket). */
function bucketMedicationTime(time: string): MealTime | null {
  const [hourStr] = time.split(':');
  const hour = Number(hourStr);
  if (!Number.isFinite(hour)) return null;

  if (hour < 11) return 'Morning';
  if (hour < 13) return 'Noon';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export async function generateCareLogEntries(
  stayId: string,
  days: string[],
  feeding: CareFeedingInstruction[],
  walking: CareWalkingInstruction[],
  playing: CarePlayingInstruction[],
  medications: CareMedicationInstruction[]
): Promise<CareLogEntry[]> {
  const rows: Array<{
    stay_id: string;
    care_type: 'Feeding' | 'Walking' | 'Playing' | 'Medication';
    scheduled_date: string;
    description: string;
    time_block: MealTime | null;
  }> = [];

  for (const date of days) {
    for (const meal of rowsForDate(feeding, date)) {
      rows.push({
        stay_id: stayId,
        care_type: 'Feeding',
        scheduled_date: date,
        description: `${meal.meal_time} meal — ${meal.quantity} ${meal.food_type}`,
        time_block: meal.meal_time,
      });
    }

    for (const walk of rowsForDate(walking, date)) {
      rows.push({
        stay_id: stayId,
        care_type: 'Walking',
        scheduled_date: date,
        description: `${walk.time_block} walk — ${walk.duration_minutes} min`,
        time_block: walk.time_block,
      });
    }

    for (const play of rowsForDate(playing, date)) {
      rows.push({
        stay_id: stayId,
        care_type: 'Playing',
        scheduled_date: date,
        description: `${play.time_block} playtime — ${play.duration_minutes} min`,
        time_block: play.time_block,
      });
    }

    for (const medication of rowsForDate(medications, date)) {
      const times =
        medication.scheduled_times.length > 0
          ? medication.scheduled_times
          : ['as scheduled'];

      for (const time of times) {
        rows.push({
          stay_id: stayId,
          care_type: 'Medication',
          scheduled_date: date,
          description: `${medication.medication_name} ${medication.dose} — ${time}`,
          time_block: bucketMedicationTime(time),
        });
      }
    }
  }

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('care_log_entries')
    .insert(rows)
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareLogEntry[];
}
