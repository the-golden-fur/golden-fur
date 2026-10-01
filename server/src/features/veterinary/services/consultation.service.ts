import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
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
import type {
  PetConsultationResultEntry,
  PetPrescriptionHistoryEntry,
} from '../../customers/pets/pet.types.ts';
import type { UpdateConsultationInput } from '../modules/validators/veterinary.validator.ts';
import type { Consultation, VeterinarianPatient } from '../veterinary.types.ts';

// consultations has TWO foreign keys to bookings (booking_id and
// follow_up_booking_id - see ...040_m07_create_veterinary_schema.sql), so
// the embed must name which one via `!booking_id` - an unqualified
// `bookings(*)` is ambiguous to PostgREST and 400s ("more than one
// relationship was found for 'consultations' and 'bookings'").
const CONSULTATION_SELECT = '*, booking:bookings!booking_id(*)';

/** The bookings a vet can act on: 'In Progress', plus 'Pending' ones that
 * have been paid for (the paid check is in listConsultationQueue itself).
 * For a time (walk-in booking flow change) this was 'In Progress' only, so
 * a paid online booking was invisible on this queue until a receptionist
 * pressed Check In; now the vet sees what's booked before the customer
 * arrives, same as the Grooming Queue. An UNPAID Pending booking stays out -
 * it isn't a secured appointment yet (the line startBooking itself draws).
 * Walk-in bookings (booking_source = 'Walk-in') are created directly at 'In
 * Progress' and appear immediately, as before. This is also the
 * auto-vivify-eligible set - a consultations row only ever gets created
 * for a booking while it's still actionable, never retroactively for one
 * that's already Completed. */
const QUEUE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
];

/** Superset of QUEUE_BOOKING_STATUSES used for what the queue actually
 * returns - Completed bookings are included (read-only, so the console can
 * show the day's finished visits alongside the actionable ones) but are
 * never auto-vivified, since a Completed Veterinary booking must have
 * passed through In Progress already and picked up a consultations row
 * then. Cancelled/No-show are deliberately excluded: those bookings often
 * never became actionable, so there's frequently no consultation record to
 * show at all. */
const LIST_BOOKING_STATUSES: readonly BookingStatus[] = [
  ...QUEUE_BOOKING_STATUSES,
  'Completed',
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
 *
 * allDates is the explicit "no date limit at all": the client's "All
 * dates" preset has no bounds to send, which on its own is
 * indistinguishable from "nothing was asked for" and so used to fall into
 * the today default - the filter said All dates and showed one day.
 */
function resolveDateRangeUtc(
  dateFrom?: string,
  dateTo?: string,
  allDates = false
): { dayStart: string; dayEnd: string } {
  if (!dateFrom && !dateTo) {
    return allDates
      ? {
          dayStart: '1970-01-01T00:00:00.000Z',
          dayEnd: '9999-12-31T00:00:00.000Z',
        }
      : todayRangeUtc();
  }

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
  /** True for the "All dates" filter - every date, past and upcoming,
   * instead of the today default. Ignored when a bound is given. */
  allDates?: boolean;
}

/**
 * Issue #66: the Makati Veterinary consultation queue for the given date
 * range (today by default). Auto-vivifies a 'Pending' consultations row for
 * any actionable Veterinary booking (In Progress, or Pending and paid -
 * see QUEUE_BOOKING_STATUSES above) that
 * doesn't have one yet - mirrors #64's grooming_sessions pattern (no DB
 * trigger exists anywhere in this
 * codebase; see grooming.service.ts's own dev note on why). Any
 * Veterinarian may see and open any row - no per-vet scoping, matching the
 * explicit "no per-pet assigned-vet restriction" carve-out - so unlike
 * listGroomingQueue, this never filters by requester. Also returns the
 * day's Completed visits (read-only, see LIST_BOOKING_STATUSES) so the
 * console isn't limited to only-actionable rows.
 */
export async function listConsultationQueue({
  dateFrom,
  dateTo,
  allDates,
}: ListConsultationQueueParams = {}): Promise<Consultation[]> {
  const { dayStart, dayEnd } = resolveDateRangeUtc(dateFrom, dateTo, allDates);

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(
      'id, pet_id, branch_id, assigned_staff_id, special_instructions, status, payment_status'
    )
    .eq('service_category', 'Veterinary')
    .in('status', LIST_BOOKING_STATUSES)
    .gte('scheduled_start', dayStart)
    .lt('scheduled_start', dayEnd)
    // Custom change (P-1 roadmap item: generic downpayment): same gate as
    // grooming.service.ts's listGroomingQueue - see 20260808111's dev notes.
    .or('downpayment_required.eq.false,payment_status.neq.Pending');

  if (bookingsError) throwWithStatus(400, bookingsError.message);

  const bookingRows = (
    (bookings ?? []) as Array<{
      id: string;
      pet_id: string;
      branch_id: string;
      assigned_staff_id: string;
      special_instructions: string | null;
      status: BookingStatus;
      payment_status?: string;
    }>
  )
    // A Pending booking only belongs here once something has been paid.
    .filter(
      (row) => !(row.status === 'Pending' && row.payment_status === 'Pending')
    );

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
  const vivifyEligible = bookingRows.filter((row) =>
    QUEUE_BOOKING_STATUSES.includes(row.status)
  );
  const missing = vivifyEligible.filter(
    (row) => !existingBookingIds.has(row.id)
  );

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

/**
 * "My Patients": every pet this veterinarian has actually finished a
 * consultation for (booking status in FINISHED_BOOKING_STATUSES), deduped
 * to one row per pet with its most recent finished visit. No
 * "distinct"/aggregate query pattern exists anywhere else in this codebase
 * (Supabase/PostgREST queries here are plain .select()/.eq(), dedup done in
 * JS) - mirrors currentPrescription.service.ts's own `!inner` join +
 * pick-most-recent-in-JS shape, adapted from "per pet" to "per pet for this
 * veterinarian".
 */
export async function listVeterinarianPatients(
  veterinarianId: string
): Promise<VeterinarianPatient[]> {
  const { data, error } = await supabase
    .from('consultations')
    .select(
      'pet_id, booking:bookings!booking_id!inner(customer_id, status, completed_at, scheduled_start)'
    )
    .eq('veterinarian_id', veterinarianId)
    .in('booking.status', FINISHED_BOOKING_STATUSES);

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as unknown as Array<{
    pet_id: string;
    booking: {
      customer_id: string;
      status: string;
      completed_at: string | null;
      scheduled_start: string;
    };
  }>;

  const latestByPet = new Map<string, VeterinarianPatient>();

  for (const row of rows) {
    const visitAt = row.booking.completed_at ?? row.booking.scheduled_start;
    const existing = latestByPet.get(row.pet_id);

    if (
      !existing ||
      new Date(visitAt).getTime() > new Date(existing.last_visit_at).getTime()
    ) {
      latestByPet.set(row.pet_id, {
        pet_id: row.pet_id,
        customer_id: row.booking.customer_id,
        last_visit_at: visitAt,
      });
    }
  }

  return Array.from(latestByPet.values()).sort(
    (a, b) =>
      new Date(b.last_visit_at).getTime() - new Date(a.last_visit_at).getTime()
  );
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
    // #117: procedure line items removed - the Procedures section of the
    // consultation form (and its input.procedures field) no longer exist;
    // see 20260929230_custom_drop_vet_procedure_catalog.sql's header note.
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
    // consultations.medications stores {name, dose, notes, medicine_type,
    // frequency, duration} (#63 migration comment, widened #117) - amount is
    // a billing-time-only input, stripped before persisting to the clinical
    // record.
    update.medications = input.medications.map(
      ({ name, dose, notes, medicine_type, frequency, duration }) => ({
        name,
        dose,
        notes: notes ?? null,
        medicine_type: medicine_type ?? null,
        frequency: frequency ?? null,
        duration: duration ?? null,
      })
    );
  }
  if (input.form_responses !== undefined) {
    // #117: no stripping needed - updateConsultationValidator's .strict()
    // already constrains the shape to exactly what should be persisted.
    update.form_responses = input.form_responses;
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

// -----------------------------------------------------------------------
// #117: staff-facing "every patient" read functions, backing the
// Prescriptions list page. (The equivalent standalone Consultation Results
// list page was removed - a consultation's results are reached from a
// "Results" row option on the Consultation Queue instead, since the row
// already carries its own form_responses - see VeterinaryConsolePage.tsx.)
// -----------------------------------------------------------------------

/** `!inner` (unlike CONSULTATION_SELECT above) so `.in('booking.status', …)`
 * can actually filter on the joined booking's status - same reasoning as
 * listVeterinarianPatients' own select string. */
const FINISHED_CONSULTATION_SELECT = '*, booking:bookings!booking_id!inner(*)';

async function listFinishedConsultations(): Promise<Consultation[]> {
  const { data, error } = await supabase
    .from('consultations')
    .select(FINISHED_CONSULTATION_SELECT)
    .in('booking.status', FINISHED_BOOKING_STATUSES)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);
  return (data ?? []) as Consultation[];
}

/**
 * #117 staff-facing Prescriptions page: every finished consultation that
 * actually prescribed at least one medication, across every patient - same
 * "any Veterinarian/Admin/Supervisor/Superadmin/Receptionist may read"
 * visibility as the rest of this feature (VETERINARY_READ_ROLES).
 */
export async function listPrescriptions(): Promise<Consultation[]> {
  const consultations = await listFinishedConsultations();
  return consultations.filter(
    (consultation) =>
      consultation.medications && consultation.medications.length > 0
  );
}

// -----------------------------------------------------------------------
// #117: customer-facing "my own pet's history" read functions, backing
// GET /pets/:id/prescriptions and GET /pets/:id/consultation-results
// (pet.routes.ts). Trimmed to PetPrescriptionHistoryEntry/
// PetConsultationResultEntry, not the full Consultation row - see those
// types' own header notes in pet.types.ts.
// -----------------------------------------------------------------------

async function getPetOwnerId(petId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pets')
    .select('customer_id')
    .eq('id', petId)
    .maybeSingle();

  return data?.customer_id ?? null;
}

interface PetClinicalHistoryParams {
  requesterId: string;
  petId: string;
}

/** Mirrors medicalNote.service.ts's assertCanRead / petHealthConditions
 * .service.ts's getPetHealthConditions: the pet's own owner, or any
 * authenticated staff role, may read - nobody else. Duplicated locally
 * rather than extracted into a shared helper, matching how each of those
 * two files already keeps its own copy. */
async function assertCanReadPetClinicalHistory(
  requesterId: string,
  petId: string
) {
  const ownerId = await getPetOwnerId(petId);

  if (!ownerId) {
    throwWithStatus(404, 'Pet not found');
  }

  if (ownerId === requesterId) return;

  const role = await getStaffRoleOrNull(requesterId);
  if (!role) throwWithStatus(403, 'Forbidden');
}

/**
 * #117: a customer's own pet's prescription history - every finished
 * consultation that prescribed at least one medication. Reuses
 * listPetConsultationHistory rather than a new query, then filters/trims.
 */
export async function listPetPrescriptionsForRequester({
  requesterId,
  petId,
}: PetClinicalHistoryParams): Promise<PetPrescriptionHistoryEntry[]> {
  await assertCanReadPetClinicalHistory(requesterId, petId);

  const consultations = await listPetConsultationHistory(petId);

  return consultations
    .filter(
      (consultation) =>
        consultation.booking &&
        FINISHED_BOOKING_STATUSES.includes(consultation.booking.status) &&
        consultation.medications &&
        consultation.medications.length > 0
    )
    .map((consultation) => ({
      consultation_id: consultation.id,
      date: consultation.booking?.completed_at ?? consultation.created_at,
      medications: consultation.medications ?? [],
    }));
}

/**
 * #117: a customer's own pet's consultation-results history - the read-only
 * counterpart to listPetPrescriptionsForRequester, for filled-in custom-form
 * results instead of medications.
 */
export async function listPetConsultationResultsForRequester({
  requesterId,
  petId,
}: PetClinicalHistoryParams): Promise<PetConsultationResultEntry[]> {
  await assertCanReadPetClinicalHistory(requesterId, petId);

  const consultations = await listPetConsultationHistory(petId);

  return consultations
    .filter(
      (consultation) =>
        consultation.booking &&
        FINISHED_BOOKING_STATUSES.includes(consultation.booking.status) &&
        consultation.form_responses &&
        consultation.form_responses.length > 0
    )
    .map((consultation) => ({
      consultation_id: consultation.id,
      date: consultation.booking?.completed_at ?? consultation.created_at,
      form_responses: consultation.form_responses ?? [],
    }));
}
