import { supabase } from '../../../config/supabase/supabase.config.ts';
import { startBooking } from '../../booking/services/booking.service.ts';
import { getCurrentPrescription } from '../../veterinary/services/currentPrescription.service.ts';
import {
  assignCage,
  releaseCage,
  suggestCage,
} from './cageAssignment.service.ts';
import type { CheckInInput } from '../modules/validators/hotel.validator.ts';
import type {
  CareFeedingInstruction,
  CareLogEntry,
  CareMedicationInstruction,
  CareWalkingInstruction,
  CheckInResult,
  HotelStay,
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
    .from('hotel_stays')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (existingError) throwWithStatus(400, existingError.message);
  if (existingStay) {
    throwWithStatus(409, 'This booking has already been checked in');
  }

  let cageId = input.cage_id;

  if (!cageId) {
    const suggestion = await suggestCage(booking.pet_id, branchId);
    cageId = suggestion.availableCages[0]?.id;

    if (!cageId) {
      throwWithStatus(
        409,
        `No available cage of the suggested size (${suggestion.suggestedSize})`
      );
    }
  }

  const cage = await assignCage(cageId, branchId);

  try {
    const now = new Date();
    const scheduledCheckOutDate = String(booking.scheduled_end).slice(0, 10);

    const { data: stay, error: stayError } = await supabase
      .from('hotel_stays')
      .insert({
        booking_id: booking.id,
        pet_id: booking.pet_id,
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
    // the hotel_stays row (and the cage claim behind it) exist. Still inside
    // the try/catch above, so a failure here (e.g. an unexpected concurrent
    // status change) releases the cage exactly like any other failure past
    // the claim - it never strands an Occupied cage.
    await startBooking({ bookingId: booking.id });

    const checkInDate = now.toISOString().slice(0, 10);
    const days = enumerateDates(checkInDate, scheduledCheckOutDate);

    const feeding = await insertFeedingInstructions(stay.id, input.feeding);
    const walking = await insertWalkingInstructions(stay.id, input.walking);
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
      medications
    );

    return {
      stay: stay as HotelStay,
      feeding,
      walking,
      medications,
      careLogEntries,
    };
  } catch (error) {
    await releaseCage(cage.id);
    throw error;
  }
}

/**
 * Sprint 5 unification (#82): food_catalog/medication_catalog merged into
 * one product_catalog table (migration 20260731067) - both feeding and
 * medication rows now resolve their catalog price from the same table, no
 * `table` parameter needed anymore.
 */
async function getCatalogPrices(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('product_catalog')
    .select('id, price')
    .in('id', ids);

  if (error) throwWithStatus(400, error.message);

  return new Map(
    ((data ?? []) as Array<{ id: string; price: number }>).map((row) => [
      row.id,
      row.price,
    ])
  );
}

/**
 * #79 revision: charged_price is always computed server-side from the
 * catalog's current price, never accepted from the request - the client
 * only ever sends food_catalog_id + brought_by_customer, matching the
 * "never trust a client-supplied price" pattern used throughout checkout.
 * A row with no food_catalog_id (freetext, not matched to a catalog entry)
 * has no known price to charge, so brought_by_customer is forced true and
 * charged_price stays null regardless of what the client sent - freetext
 * items are never billable.
 */
async function insertFeedingInstructions(
  hotelStayId: string,
  rows: CheckInInput['feeding']
): Promise<CareFeedingInstruction[]> {
  if (rows.length === 0) return [];

  const catalogIds = Array.from(
    new Set(
      rows
        .map((row) => row.food_catalog_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const pricesById = await getCatalogPrices(catalogIds);

  const preparedRows = rows.map((row) => {
    const broughtByCustomer = row.food_catalog_id
      ? row.brought_by_customer
      : true;
    const chargedPrice =
      !broughtByCustomer && row.food_catalog_id
        ? (pricesById.get(row.food_catalog_id) ?? null)
        : null;

    return {
      meal_time: row.meal_time,
      food_type: row.food_type,
      quantity: row.quantity,
      special_instructions: row.special_instructions,
      food_catalog_id: row.food_catalog_id ?? null,
      brought_by_customer: broughtByCustomer,
      charged_price: chargedPrice,
      hotel_stay_id: hotelStayId,
    };
  });

  const { data, error } = await supabase
    .from('care_feeding_instructions')
    .insert(preparedRows)
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareFeedingInstruction[];
}

async function insertWalkingInstructions(
  hotelStayId: string,
  rows: CheckInInput['walking']
): Promise<CareWalkingInstruction[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('care_walking_instructions')
    .insert(rows.map((row) => ({ ...row, hotel_stay_id: hotelStayId })))
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareWalkingInstruction[];
}

/**
 * #75 AC-3: when the request omits `medications` entirely, auto-fills from
 * M07's current-prescription derivation (empty when no current prescription
 * exists); when the request provides the field (including `[]`), it is used
 * verbatim as the receptionist's own list, with no source note attached -
 * only genuinely M07-derived rows carry source_prescription_note.
 */
async function insertMedicationInstructions(
  hotelStayId: string,
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
    brought_by_customer?: boolean;
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

  // #79 revision: same server-computed charged_price + freetext-forces-
  // brought_by_customer=true rule as insertFeedingInstructions above.
  const catalogIds = Array.from(
    new Set(
      rows
        .map((row) => row.medication_catalog_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const pricesById = await getCatalogPrices(catalogIds);

  const preparedRows = rows.map((row) => {
    const broughtByCustomer = row.medication_catalog_id
      ? (row.brought_by_customer ?? true)
      : true;
    const chargedPrice =
      !broughtByCustomer && row.medication_catalog_id
        ? (pricesById.get(row.medication_catalog_id) ?? null)
        : null;

    return {
      medication_name: row.medication_name,
      dose: row.dose,
      scheduled_times: row.scheduled_times,
      administration_notes: row.administration_notes,
      source_prescription_note: row.source_prescription_note,
      medication_catalog_id: row.medication_catalog_id ?? null,
      brought_by_customer: broughtByCustomer,
      charged_price: chargedPrice,
      hotel_stay_id: hotelStayId,
    };
  });

  const { data, error } = await supabase
    .from('care_medication_instructions')
    .insert(preparedRows)
    .select('*');

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as CareMedicationInstruction[];
}

async function generateCareLogEntries(
  hotelStayId: string,
  days: string[],
  feeding: CareFeedingInstruction[],
  walking: CareWalkingInstruction[],
  medications: CareMedicationInstruction[]
): Promise<CareLogEntry[]> {
  const rows: Array<{
    hotel_stay_id: string;
    care_type: 'Feeding' | 'Walking' | 'Medication';
    scheduled_date: string;
    description: string;
  }> = [];

  for (const date of days) {
    for (const meal of feeding) {
      rows.push({
        hotel_stay_id: hotelStayId,
        care_type: 'Feeding',
        scheduled_date: date,
        description: `${meal.meal_time} meal — ${meal.quantity} ${meal.food_type}`,
      });
    }

    for (const walk of walking) {
      rows.push({
        hotel_stay_id: hotelStayId,
        care_type: 'Walking',
        scheduled_date: date,
        description: `${walk.time_block} walk — ${walk.duration_minutes} min`,
      });
    }

    for (const medication of medications) {
      const times =
        medication.scheduled_times.length > 0
          ? medication.scheduled_times
          : ['as scheduled'];

      for (const time of times) {
        rows.push({
          hotel_stay_id: hotelStayId,
          care_type: 'Medication',
          scheduled_date: date,
          description: `${medication.medication_name} ${medication.dose} — ${time}`,
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
