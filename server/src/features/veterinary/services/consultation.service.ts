import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  FINISHED_BOOKING_STATUSES,
  type BookingStatus,
} from '../../booking/booking.types.ts';
import {
  completeBooking,
  startBooking,
} from '../../booking/services/booking.service.ts';
import { assertVeterinaryBranchEligibility } from '../../booking/services/veterinaryEligibility.service.ts';
import { createVaccinationRecord } from '../../customers/pets/services/vaccinationRecord.service.ts';
import type { UpdateConsultationInput } from '../modules/validators/veterinary.validator.ts';
import type { Consultation } from '../veterinary.types.ts';

// consultations has TWO foreign keys to bookings (booking_id and
// follow_up_booking_id - see ...040_m07_create_veterinary_schema.sql), so
// the embed must name which one via `!booking_id` - an unqualified
// `bookings(*)` is ambiguous to PostgREST and 400s ("more than one
// relationship was found for 'consultations' and 'bookings'").
const CONSULTATION_SELECT = '*, booking:bookings!booking_id(*)';

/** Booking-status revision: Veterinary never had a payment gate on initial
 * status (#51 dev notes), so the old "Confirmed queue" vs "Pending awaiting
 * payment" split (listUnconfirmedVeterinaryBookings) no longer means
 * anything - both statuses are actionable today, so listConsultationQueue
 * alone now covers everything. */
const QUEUE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
];

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function todayRangeUtc(): { dayStart: string; dayEnd: string } {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart: dayStart.toISOString(), dayEnd: dayEnd.toISOString() };
}

/**
 * Defaults to today (unchanged from before the queue's date filter existed)
 * when neither bound is given - every existing caller/test relies on this.
 * Otherwise resolves the given inclusive [dateFrom, dateTo] (YYYY-MM-DD)
 * bounds to a UTC instant range, matching the QueueFilterBar date-range
 * presets on the client (client/src/shared/components/QueueFilterBar) and
 * grooming.service.ts's own resolveDateRangeUtc.
 */
function resolveDateRangeUtc(
  dateFrom?: string,
  dateTo?: string
): { dayStart: string; dayEnd: string } {
  if (!dateFrom && !dateTo) return todayRangeUtc();

  const dayStart = dateFrom
    ? `${dateFrom}T00:00:00.000Z`
    : '1970-01-01T00:00:00.000Z';
  const dayEnd = dateTo
    ? new Date(
        new Date(`${dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000
      ).toISOString()
    : '9999-12-31T00:00:00.000Z';

  return { dayStart, dayEnd };
}

interface ListConsultationQueueParams {
  /** Inclusive date-range bounds (YYYY-MM-DD) - both default to today when
   * omitted. */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Issue #66: the Makati Veterinary consultation queue for the given date
 * range (today by default). Auto-vivifies a 'Pending' consultations row for
 * any actionable Veterinary booking (bookings.status Pending or In
 * Progress - booking-status revision) that doesn't have one yet - mirrors
 * #64's grooming_sessions pattern (no DB trigger exists anywhere in this
 * codebase; see grooming.service.ts's own dev note on why). Any
 * Veterinarian may see and open any row - no per-vet scoping, matching the
 * explicit "no per-pet assigned-vet restriction" carve-out - so unlike
 * listGroomingQueue, this never filters by requester.
 */
export async function listConsultationQueue({
  dateFrom,
  dateTo,
}: ListConsultationQueueParams = {}): Promise<Consultation[]> {
  const { dayStart, dayEnd } = resolveDateRangeUtc(dateFrom, dateTo);

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, pet_id, branch_id, assigned_staff_id, special_instructions')
    .eq('service_category', 'Veterinary')
    .in('status', QUEUE_BOOKING_STATUSES)
    .gte('scheduled_start', dayStart)
    .lt('scheduled_start', dayEnd)
    // Custom change (P-1 roadmap item: generic downpayment): same gate as
    // grooming.service.ts's listGroomingQueue - see 20260808111's dev notes.
    .or('downpayment_required.eq.false,payment_stage.neq.Unpaid');

  if (bookingsError) throwWithStatus(400, bookingsError.message);

  const bookingRows = (bookings ?? []) as Array<{
    id: string;
    pet_id: string;
    branch_id: string;
    assigned_staff_id: string;
    special_instructions: string | null;
  }>;

  if (bookingRows.length === 0) return [];

  const bookingIds = bookingRows.map((row) => row.id);

  const { data: existing, error: existingError } = await supabase
    .from('consultations')
    .select('booking_id')
    .in('booking_id', bookingIds);

  if (existingError) throwWithStatus(400, existingError.message);

  const existingBookingIds = new Set(
    (existing ?? []).map((row) => row.booking_id as string)
  );
  const missing = bookingRows.filter((row) => !existingBookingIds.has(row.id));

  if (missing.length > 0) {
    // AC-5 defense-in-depth: booking creation (#53) already blocks a
    // Veterinary booking at a non-Makati branch, but this auto-vivify step
    // re-checks so a consultation itself can never be created against one,
    // independent of how the booking came to exist.
    for (const row of missing) {
      await assertVeterinaryBranchEligibility({
        branchId: row.branch_id,
        serviceCategory: 'Veterinary',
      });
    }

    const { error: insertError } = await supabase.from('consultations').insert(
      missing.map((row) => ({
        booking_id: row.id,
        pet_id: row.pet_id,
        veterinarian_id: row.assigned_staff_id,
        reason_for_visit: row.special_instructions ?? 'General consultation',
      }))
    );

    if (insertError) throwWithStatus(400, insertError.message);
  }

  const { data: consultations, error: consultationsError } = await supabase
    .from('consultations')
    .select(CONSULTATION_SELECT)
    .in('booking_id', bookingIds);

  if (consultationsError) throwWithStatus(400, consultationsError.message);

  const rows = (consultations ?? []) as Consultation[];

  return rows.sort(
    (a, b) =>
      new Date(a.booking!.scheduled_start).getTime() -
      new Date(b.booking!.scheduled_start).getTime()
  );
}

export async function getConsultation(
  consultationId: string
): Promise<Consultation> {
  const { data, error } = await supabase
    .from('consultations')
    .select(CONSULTATION_SELECT)
    .eq('id', consultationId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Consultation not found');

  return data as Consultation;
}

/**
 * Issue #66 AC-3: read-only, reachable from within any consultation - all
 * prior consultations, diagnoses, and medications for a pet. No established
 * ordering convention to match yet (M02's own Service History tab is still
 * the Sprint 1 placeholder pending exactly this wiring - PetProfilePage.tsx);
 * newest-first is the natural default for a "history" view and is what
 * currentPrescription.service.ts's own derivation query already assumes.
 */
export async function listPetConsultationHistory(
  petId: string
): Promise<Consultation[]> {
  const { data, error } = await supabase
    .from('consultations')
    .select(CONSULTATION_SELECT)
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Consultation[];
}

interface UpdateConsultationParams {
  requesterId: string;
  consultationId: string;
  input: UpdateConsultationInput;
}

/**
 * Issue #66: any Veterinarian may update any consultation (route + here both
 * gate on role only, no ownership check - matching the explicit
 * "no per-pet assigned-vet restriction" carve-out). On status -> Completed:
 * writes consultation_line_items (professional fee + one row per medication/
 * procedure - AC-2) and, if a vaccination was administered, writes through
 * to pet_vaccination_records immediately (AC-3), reusing the existing #33
 * service rather than duplicating the insert.
 *
 * Booking-status revision: consultations.status/completed_at no longer
 * exist - a status transition here delegates entirely to
 * booking.service.ts's startBooking/completeBooking, which already enforce
 * the Pending -> In Progress -> Completed/Paid ordering (409 on an invalid
 * jump) and are what now actually sets bookings.status. This also fixes the
 * pre-existing asymmetry where this function used to finalize a
 * consultation without ever syncing bookings.status back (unlike Grooming).
 */
export async function updateConsultation({
  requesterId,
  consultationId,
  input,
}: UpdateConsultationParams): Promise<Consultation> {
  const consultation = await getConsultation(consultationId);
  const bookingStatus = consultation.booking?.status;

  if (bookingStatus && FINISHED_BOOKING_STATUSES.includes(bookingStatus)) {
    throwWithStatus(409, 'This consultation is already finalized');
  }

  if (input.status === 'Ongoing') {
    await startBooking({ bookingId: consultation.booking_id });
  } else if (input.status === 'Completed') {
    await completeBooking({ bookingId: consultation.booking_id });
  }

  if (input.status === 'Completed') {
    // TODO(Sprint 5, M08): post these as real transaction line items once
    // M08 exists - for now they're only stored and queryable, tagged for
    // future veterinary-revenue attribution in the M14 DSR.
    const lineItems: Record<string, unknown>[] = [
      {
        consultation_id: consultationId,
        item_type: 'professional_fee',
        description: 'Professional Fee',
        amount: input.professional_fee,
      },
      ...(input.medications ?? []).map((medication) => ({
        consultation_id: consultationId,
        item_type: 'medication',
        description: medication.name,
        amount: medication.amount,
      })),
      ...(input.procedures ?? []).map((procedure) => ({
        consultation_id: consultationId,
        item_type: 'procedure',
        procedure_type: procedure.procedure_type,
        description: procedure.description,
        amount: procedure.amount,
      })),
    ];

    const { error: lineItemsError } = await supabase
      .from('consultation_line_items')
      .insert(lineItems);

    if (lineItemsError) throwWithStatus(400, lineItemsError.message);

    if (input.vaccination) {
      await createVaccinationRecord({
        requesterId,
        petId: consultation.pet_id,
        vaccineName: input.vaccination.vaccine_name,
        dateAdministered: input.vaccination.date_administered,
        nextDueDate: input.vaccination.next_due_date,
        notes: input.vaccination.notes,
      });
    }
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (input.temperature !== undefined) update.temperature = input.temperature;
  if (input.weight !== undefined) update.weight = input.weight;
  if (input.heart_rate !== undefined) update.heart_rate = input.heart_rate;
  if (input.respiratory_rate !== undefined) {
    update.respiratory_rate = input.respiratory_rate;
  }
  if (input.diagnosis !== undefined) update.diagnosis = input.diagnosis;
  if (input.reason_for_visit !== undefined) {
    update.reason_for_visit = input.reason_for_visit;
  }
  if (input.medications !== undefined) {
    // consultations.medications stores {name, dose, notes} only (#63
    // migration comment) - amount is a billing-time-only input, stripped
    // before persisting to the clinical record.
    update.medications = input.medications.map(({ name, dose, notes }) => ({
      name,
      dose,
      notes: notes ?? null,
    }));
  }

  // Applied last so the returned booking join (CONSULTATION_SELECT embeds
  // booking:bookings(*)) reflects the post-transition bookings.status from
  // startBooking/completeBooking above, not the pre-transition snapshot.
  const { data: updated, error: updateError } = await supabase
    .from('consultations')
    .update(update)
    .eq('id', consultationId)
    .select(CONSULTATION_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to update consultation'
    );
  }

  return updated as Consultation;
}
