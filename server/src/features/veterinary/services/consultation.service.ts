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
import type {
  Consultation,
  ConsultationMedication,
  VeterinarianPatient,
} from '../veterinary.types.ts';
import {
  applyPharmacyCharge,
  planPharmacyCharge,
  type PharmacyChargePlan,
} from './pharmacyCharge.service.ts';
import { postServicesDoneCharge } from './serviceCharge.service.ts';
import {
  notifyMedicineChargeChange,
  notifyVisitCharges,
} from './vetChargeNotifications.service.ts';

// consultations has TWO foreign keys to bookings (booking_id and
// follow_up_booking_id - see ...040_m07_create_veterinary_schema.sql), so
// the embed must name which one via `!booking_id` - an unqualified
// `bookings(*)` is ambiguous to PostgREST and 400s ("more than one
// relationship was found for 'consultations' and 'bookings'").
// medication_transaction (pharmacy prescriptions) is the visit's medicine
// sale, when there is one - only its payment_status, so the console can tell
// a vet whether an edit will still change the bill.
// line_items: what the vet listed as done at the visit ('procedure' rows),
// so View Details can show it back - see updateConsultation.
const CONSULTATION_SELECT =
  '*, booking:bookings!booking_id(*), medication_transaction:transactions!medication_transaction_id(payment_status), line_items:consultation_line_items(item_type, description, amount)';

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
 * listGroomingQueue, this never filters by requester. (Writing is a
 * different matter - see updateConsultation.) Also returns the
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

const HANDLED_BY_ANOTHER_VET =
  'This consultation is being handled by another veterinarian';

/**
 * Whoever takes a consultation owns it (20261006248): returns true when
 * this call just claimed it for the requester, false when they already
 * owned it, and throws a 403 when another vet does.
 *
 * The claim is a single conditional update (`accepted_by is null`), so two
 * vets acting at the same moment can't both win - the slower one's update
 * matches no row and gets the same 403. veterinarian_id follows the claim so
 * "My Patients" lists the vet who actually did the visit;
 * bookings.assigned_staff_id is left alone, so slot capacity is unaffected.
 */
async function claimConsultation(
  consultation: Consultation,
  requesterId: string
): Promise<boolean> {
  if (consultation.accepted_by) {
    if (consultation.accepted_by !== requesterId) {
      throwWithStatus(403, HANDLED_BY_ANOTHER_VET);
    }

    return false;
  }

  const { data, error } = await supabase
    .from('consultations')
    .update({ accepted_by: requesterId, veterinarian_id: requesterId })
    .eq('id', consultation.id)
    .is('accepted_by', null)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(403, HANDLED_BY_ANOTHER_VET);

  return true;
}

/** Undoes a claim made by this same request when the Start/Complete it was
 * for then failed (e.g. starting an unpaid booking) - otherwise the vet
 * would be left owning a consultation they never actually took. */
async function releaseConsultationClaim(
  consultation: Consultation,
  requesterId: string
): Promise<void> {
  await supabase
    .from('consultations')
    .update({
      accepted_by: null,
      veterinarian_id: consultation.veterinarian_id,
    })
    .eq('id', consultation.id)
    .eq('accepted_by', requesterId);
}

/**
 * consultations.medications stores {name, dose, notes, medicine_type,
 * strength, frequency, duration, quantity_unit, refills} (#63 migration comment, widened #117) plus, for
 * pharmacy prescriptions, quantity and the medicine-list entry it came from.
 * A price is never stored here - a sale's unit price is read from the
 * medicine list when the medicine transaction is written.
 */
function toStoredMedications(
  medications: NonNullable<UpdateConsultationInput['medications']>
): ConsultationMedication[] {
  return medications.map(
    ({
      name,
      dose,
      notes,
      medicine_type,
      strength,
      frequency,
      duration,
      quantity,
      quantity_unit,
      refills,
      medication_catalog_id,
    }) => ({
      name,
      dose,
      notes: notes ?? null,
      medicine_type: medicine_type ?? null,
      strength: strength ?? null,
      frequency: frequency ?? null,
      duration: duration ?? null,
      quantity: quantity ?? 1,
      quantity_unit: quantity_unit ?? null,
      refills: refills ?? 0,
      medication_catalog_id: medication_catalog_id ?? null,
    })
  );
}

/** Writes the visit's medicine transaction, then re-reads the consultation
 * when that changed anything - the row returned by the update that ran just
 * before doesn't know its new medication_transaction_id or booking total. */
async function applyPharmacyPlan(
  consultation: Consultation,
  plan: PharmacyChargePlan,
  requesterId: string
): Promise<Consultation> {
  await applyPharmacyCharge({ consultation, plan, requesterId });

  const changedTheBill =
    !plan.locked && (plan.existing !== null || plan.lines.length > 0);

  return changedTheBill ? getConsultation(consultation.id) : consultation;
}

const FINISHED_EDITABLE_FIELDS: ReadonlyArray<keyof UpdateConsultationInput> = [
  'diagnosis',
  'medications',
  'sold_at_pharmacy',
];

/**
 * Pharmacy prescriptions: a finished consultation is no longer frozen
 * outright - the vet who handled it may still correct its diagnosis and
 * prescription (and where the customer is buying the medicine). Everything
 * else stays final: status, professional fee, vitals, form results and the
 * vaccination all 409 exactly as before.
 *
 * accepted_by is who handled it; visits finished before that column existed
 * (20261006248) have it null, so they fall back to veterinarian_id.
 *
 * The medicine transaction follows the edit while it is still unpaid, and is
 * left alone once paid - see pharmacyCharge.service.ts.
 */
async function updateFinishedConsultation({
  requesterId,
  consultation,
  input,
}: {
  requesterId: string;
  consultation: Consultation;
  input: UpdateConsultationInput;
}): Promise<Consultation> {
  const touchesAFinalField = (
    Object.keys(input) as Array<keyof UpdateConsultationInput>
  ).some(
    (key) => input[key] !== undefined && !FINISHED_EDITABLE_FIELDS.includes(key)
  );

  if (touchesAFinalField) {
    throwWithStatus(
      409,
      'This consultation is already finalized - only its diagnosis and prescription can still be changed'
    );
  }

  const handledBy = consultation.accepted_by ?? consultation.veterinarian_id;
  if (handledBy !== requesterId) {
    throwWithStatus(403, HANDLED_BY_ANOTHER_VET);
  }

  const medications =
    input.medications !== undefined
      ? toStoredMedications(input.medications)
      : (consultation.medications ?? []);
  const soldAtPharmacy =
    input.sold_at_pharmacy ?? consultation.sold_at_pharmacy ?? false;

  // Before any write, so a medicine that can't be priced saves nothing.
  const plan = await planPharmacyCharge({
    consultation,
    medications,
    soldAtPharmacy,
  });

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    sold_at_pharmacy: soldAtPharmacy,
  };
  if (input.diagnosis !== undefined) update.diagnosis = input.diagnosis;
  if (input.medications !== undefined) update.medications = medications;

  const { data: updated, error: updateError } = await supabase
    .from('consultations')
    .update(update)
    .eq('id', consultation.id)
    .select(CONSULTATION_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to update consultation'
    );
  }

  const saved = await applyPharmacyPlan(
    updated as Consultation,
    plan,
    requesterId
  );

  // The customer hears about every change to what they owe.
  await notifyMedicineChargeChange({ consultation: saved, plan });

  return saved;
}

/**
 * Issue #66, revised: the route still gates on role only (any Veterinarian),
 * but a consultation now belongs to the vet who takes it - the one who
 * presses Start, or the first to save/complete one that was already In
 * Progress (a receptionist check-in or a walk-in). From then on only that
 * vet may edit or complete it; see claimConsultation. A still-Pending,
 * unclaimed consultation stays editable by any vet until someone starts it.
 * On status -> Completed:
 * writes the professional fee, when one was given, to
 * consultation_line_items (AC-2) and, if a
 * vaccination was administered, writes through to pet_vaccination_records
 * immediately (AC-3), reusing the existing #33 service rather than
 * duplicating the insert. Prescribed medicines are NOT line items any more:
 * when the customer buys them from this branch's pharmacy they're billed as
 * their own transaction (pharmacyCharge.service.ts), and otherwise not at
 * all. Vet-priced visits: the services the vet lists as done
 * (`services_done`) are recorded and billed as their own transaction too
 * (serviceCharge.service.ts). A finished consultation is handed to
 * updateFinishedConsultation.
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
    return updateFinishedConsultation({ requesterId, consultation, input });
  }

  const takesOwnership =
    bookingStatus === 'In Progress' || input.status !== undefined;
  let claimedNow = false;

  if (takesOwnership) {
    claimedNow = await claimConsultation(consultation, requesterId);
  } else if (
    consultation.accepted_by &&
    consultation.accepted_by !== requesterId
  ) {
    throwWithStatus(403, HANDLED_BY_ANOTHER_VET);
  }

  let pharmacyPlan: PharmacyChargePlan | null = null;
  // Only a completion bills anything - services listed on any other save
  // are ignored.
  const servicesDone =
    input.status === 'Completed' ? (input.services_done ?? []) : [];

  try {
    if (input.status === 'Ongoing') {
      await startBooking({ bookingId: consultation.booking_id });
    } else if (input.status === 'Completed') {
      // Planned before the booking is completed, so a medicine that can't be
      // priced stops the whole save rather than failing a finished visit.
      pharmacyPlan = await planPharmacyCharge({
        consultation,
        medications:
          input.medications !== undefined
            ? toStoredMedications(input.medications)
            : (consultation.medications ?? []),
        soldAtPharmacy:
          input.sold_at_pharmacy ?? consultation.sold_at_pharmacy ?? false,
      });
      await completeBooking({ bookingId: consultation.booking_id });
    }
  } catch (error) {
    if (claimedNow) await releaseConsultationClaim(consultation, requesterId);
    throw error;
  }

  if (input.status === 'Completed') {
    // TODO(Sprint 5, M08): post these as real transaction line items once
    // M08 exists - for now they're only stored and queryable, tagged for
    // future veterinary-revenue attribution in the M14 DSR.
    // #117: procedure line items removed - the Procedures section of the
    // consultation form (and its input.procedures field) no longer exist;
    // see 20260929230_custom_drop_vet_procedure_catalog.sql's header note.
    // Pharmacy prescriptions: medication line items removed too - medicines
    // are billed by applyPharmacyCharge below, and a row here as well would
    // bill them a second time at checkout.
    // The Consultation Details form no longer asks for a professional fee,
    // so a visit completed from it has no fee row at all (rather than a
    // "Professional Fee: 0" line on the bill) - only a completion that
    // actually names a fee writes one.
    if (input.professional_fee !== undefined) {
      const { error: lineItemsError } = await supabase
        .from('consultation_line_items')
        .insert([
          {
            consultation_id: consultationId,
            item_type: 'professional_fee',
            description: 'Professional Fee',
            amount: input.professional_fee,
          },
        ]);

      if (lineItemsError) throwWithStatus(400, lineItemsError.message);
    }

    // Vet-priced visits: what the vet says was done, and what each item
    // costs. Kept here as the visit's own record ('procedure' rows - also
    // what checkout would itemize); the money side is
    // postServicesDoneCharge, after the consultation row is saved below.
    if (servicesDone.length > 0) {
      const { error: servicesError } = await supabase
        .from('consultation_line_items')
        .insert(
          servicesDone.map((service) => ({
            consultation_id: consultationId,
            item_type: 'procedure',
            description: service.name,
            amount: service.amount,
          }))
        );

      if (servicesError) throwWithStatus(400, servicesError.message);
    }

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
    update.medications = toStoredMedications(input.medications);
  }
  if (input.sold_at_pharmacy !== undefined) {
    update.sold_at_pharmacy = input.sold_at_pharmacy;
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

  let saved = updated as Consultation;

  if (pharmacyPlan) {
    saved = await applyPharmacyPlan(saved, pharmacyPlan, requesterId);
  }

  if (servicesDone.length > 0) {
    await postServicesDoneCharge({
      consultation: saved,
      lines: servicesDone,
      requesterId,
    });
    // The booking total (and what is owed) just changed.
    saved = await getConsultation(consultationId);
  }

  if (input.status === 'Completed') {
    // The customer hears what this visit charged them - services done and
    // medicines together, in one notification.
    await notifyVisitCharges({
      consultation: saved,
      servicesDone,
      pharmacyPlan,
    });
  }

  return saved;
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

interface PetOwnership {
  customer_id: string;
  name: string | null;
}

async function getPetOwnership(petId: string): Promise<PetOwnership | null> {
  const { data } = await supabase
    .from('pets')
    .select('customer_id, name')
    .eq('id', petId)
    .maybeSingle();

  if (!data?.customer_id) return null;

  return { customer_id: data.customer_id, name: data.name ?? null };
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
): Promise<PetOwnership> {
  const pet = await getPetOwnership(petId);

  if (!pet) {
    throwWithStatus(404, 'Pet not found');
  }

  if (pet.customer_id === requesterId) return pet;

  const role = await getStaffRoleOrNull(requesterId);
  if (!role) throwWithStatus(403, 'Forbidden');

  return pet;
}

/** id -> row, for the handful of ids a pet's own history touches. Skips the
 * query entirely when there's nothing to look up. */
async function lookupById<Row extends { id: string }>(
  table: string,
  columns: string,
  ids: string[]
): Promise<Map<string, Row>> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .in('id', uniqueIds);

  if (error) throwWithStatus(400, error.message);

  return new Map(
    ((data ?? []) as unknown as Row[]).map((row) => [row.id, row])
  );
}

/**
 * #117: a customer's own pet's prescription history - every finished
 * consultation that prescribed at least one medication. Reuses
 * listPetConsultationHistory rather than a new query, then filters/trims.
 * Pharmacy prescriptions: also names the vet, the branch, the pet and its
 * owner, and each medicine's quantity - what a printed prescription needs
 * when the customer takes it to another pharmacy. Deliberately no prices, and no
 * medication_catalog_id (an internal pointer).
 */
export async function listPetPrescriptionsForRequester({
  requesterId,
  petId,
}: PetClinicalHistoryParams): Promise<PetPrescriptionHistoryEntry[]> {
  const pet = await assertCanReadPetClinicalHistory(requesterId, petId);

  const consultations = await listPetConsultationHistory(petId);

  const prescribed = consultations.filter(
    (consultation) =>
      consultation.booking &&
      FINISHED_BOOKING_STATUSES.includes(consultation.booking.status) &&
      consultation.medications &&
      consultation.medications.length > 0
  );

  const vets = await lookupById<{ id: string; display_name: string }>(
    'staff_profiles',
    'id, display_name',
    prescribed.map((consultation) => consultation.veterinarian_id)
  );
  const branches = await lookupById<{
    id: string;
    name: string;
    address: string;
  }>(
    'branches',
    'id, name, address',
    prescribed.flatMap((consultation) =>
      consultation.booking?.branch_id ? [consultation.booking.branch_id] : []
    )
  );

  const owners = await lookupById<{ id: string; full_name: string }>(
    'customer_profiles',
    'id, full_name',
    prescribed.length > 0 ? [pet.customer_id] : []
  );
  const ownerName = owners.get(pet.customer_id)?.full_name ?? null;

  return prescribed.map((consultation) => {
    const branch = branches.get(consultation.booking?.branch_id ?? '');

    return {
      consultation_id: consultation.id,
      date: consultation.booking?.completed_at ?? consultation.created_at,
      veterinarian_name:
        vets.get(consultation.veterinarian_id)?.display_name ?? null,
      branch_name: branch?.name ?? null,
      branch_address: branch?.address ?? null,
      pet_name: pet.name,
      owner_name: ownerName,
      medications: (consultation.medications ?? []).map((medication) => ({
        name: medication.name,
        dose: medication.dose,
        notes: medication.notes ?? null,
        medicine_type: medication.medicine_type ?? null,
        strength: medication.strength ?? null,
        frequency: medication.frequency ?? null,
        duration: medication.duration ?? null,
        quantity: medication.quantity ?? null,
        quantity_unit: medication.quantity_unit ?? null,
        refills: medication.refills ?? null,
      })),
    };
  });
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
