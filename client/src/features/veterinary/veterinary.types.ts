import type { Booking } from '../booking/booking.types';

/** #117 prescription builder: medicine_type/frequency/duration added so
 * this row is a real prescription (medicine type, dosage, frequency), not
 * just name+dose - all three are free text (see MEDICINE_TYPE_OPTIONS/
 * FREQUENCY_OPTIONS below for suggestion-only, non-enforced dropdowns), so
 * a vet is never blocked from entering something not on the suggested
 * list. */
export interface ConsultationMedication {
  name: string;
  dose: string;
  notes?: string | null;
  medicine_type?: string | null;
  frequency?: string | null;
  duration?: string | null;
}

/** #117 consultation form builder: one field of a vet's reusable custom
 * form template. `options` only means anything when type === 'select'.
 * Custom change: 'prescription' added - "a custom field in form builder,
 * where you can insert a prescription field" - a field of this type fills
 * in with a whole editable medication list (see ConsultationDetailPanel.tsx
 * - same Add-from-catalog/Add-from-saved-prescription UI as the top-level
 * Prescription section, embedded inside a form response instead). */
export interface ConsultationFormField {
  id: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'checkbox'
    | 'date'
    | 'prescription';
  options?: string[];
  required?: boolean;
}

/** #117: a vet's personal, reusable consultation-form template - owner-
 * scoped, only the veterinarian who created it can see or edit it (same
 * shape as VetMedicationCatalogItem below). `is_default` - exactly one per
 * vet - is auto-offered the first time a fresh consultation is opened
 * (see ConsultationDetailPanel.tsx). `icon` (custom change): a curated
 * Lucide icon name, same allowlist/component as
 * VetMedicationCatalogItem.icon. */
export interface ConsultationFormTemplate {
  id: string;
  veterinarian_id: string;
  name: string;
  fields: ConsultationFormField[];
  is_default: boolean;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

/** #117: one filled-in field of a ConsultationFormResponse. label/type are
 * copied from the source template at fill-time, so a past visit's results
 * keep reading correctly even after the source template is edited or
 * deleted. Custom change: `value` widened to also hold a medication list -
 * a 'prescription'-type field's filled-in value. */
export interface ConsultationFormFieldResponse {
  field_id: string;
  label: string;
  type: ConsultationFormField['type'];
  value: string | number | boolean | null | ConsultationMedication[];
}

/** #117: one filled-in consultation-form template, part of a consultation's
 * form_responses array - a visit can have more than one filled-in result
 * (e.g. both a "Dental Check" and a "Behavior Notes" template). */
export interface ConsultationFormResponse {
  template_id: string | null;
  template_name: string;
  filled_at: string;
  fields: ConsultationFormFieldResponse[];
}

/**
 * Booking-status revision: consultations.status/completed_at were dropped
 * server-side (M07 migration) - the consultation's execution state now
 * lives entirely on the joined booking's booking.status/completed_at
 * instead (see BookingStatusBadge, FINISHED_BOOKING_STATUSES in
 * booking.types.ts).
 */
export interface Consultation {
  id: string;
  booking_id: string;
  pet_id: string;
  veterinarian_id: string;
  /** The vet who took this consultation - null until one does. Once set,
   * only that vet may edit or complete it. */
  accepted_by: string | null;
  temperature: number | null;
  weight: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  diagnosis: string | null;
  medications: ConsultationMedication[] | null;
  /** #117: filled-in consultation-form results for this visit. */
  form_responses: ConsultationFormResponse[] | null;
  reason_for_visit: string;
  follow_up_date: string | null;
  follow_up_booking_id: string | null;
  created_at: string;
  updated_at: string;
  booking?: Booking;
}

// #117: PROCEDURE_TYPES/ProcedureType/ProcedureInput removed ("the
// procedures in vet staff > my catalog dropped, since it will have no
// use") - the Procedures section of the consultation form and its personal
// catalog are both gone; nothing client-side needs to read the historical
// procedure_type shape any more.

/** #117: suggestion-only lists for the Prescription Builder's medicine-type/
 * frequency inputs (rendered as `<input list>` + `<datalist>`, see
 * ConsultationDetailPanel.tsx) - not an enum, a vet can always type
 * something else. */
export const MEDICINE_TYPE_OPTIONS: readonly string[] = [
  'Oral',
  'Topical',
  'Injectable',
  'Ophthalmic',
  'Otic',
  'Inhalant',
];

export const FREQUENCY_OPTIONS: readonly string[] = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Every 8 hours',
  'Every 12 hours',
  'As needed',
];

export interface MedicationInput {
  name: string;
  dose: string;
  notes?: string;
  medicine_type?: string;
  frequency?: string;
  duration?: string;
  /** Only required to complete a consultation (#66 AC-2). */
  amount?: number;
}

export interface VaccinationInput {
  vaccine_name: string;
  date_administered: string;
  next_due_date?: string;
  notes?: string;
}

export interface UpdateConsultationPayload {
  status?: 'Ongoing' | 'Completed';
  temperature?: number;
  weight?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  diagnosis?: string;
  reason_for_visit?: string;
  medications?: MedicationInput[];
  form_responses?: ConsultationFormResponse[];
  professional_fee?: number;
  vaccination?: VaccinationInput;
}

/** Issue #78: recorded/maintained from the consultation form only. */
export interface PetHealthCondition {
  id: string;
  pet_id: string;
  conditions_text: string | null;
  updated_by_staff_id: string;
  updated_at: string;
}

/** "My Patients": one row per distinct pet the requesting veterinarian has
 * finished a consultation for, with that pet's most recent finished-visit
 * date. customer_id (the pet's owner) lets the Consultation Queue's New
 * Consultation flow restrict a Veterinarian's Customer step to owners
 * they've actually treated (vet-bookings-queue-access). */
export interface VeterinarianPatient {
  pet_id: string;
  customer_id: string;
  last_visit_at: string;
}

/** A veterinarian's personal medication catalog entry - owner-scoped, only
 * the veterinarian who created it can see or edit it. Custom change ("My
 * Catalog" broken into Medications/Prescriptions/Forms): a medication is
 * now just a product definition (name/type/price) - `default_dose`/
 * `default_frequency` removed, since dose and frequency belong to a
 * *prescription* (see VetPrescriptionTemplate below), not the medicine
 * itself. `icon`/`image_url` (custom change): a curated Lucide icon name
 * (see shared/components/IconPicker - the same curated set services/
 * service types/packages already pick from, reused as-is here) and/or an
 * uploaded image - a Board/gallery card renders `image_url` as its
 * background when set, falling back to `icon`, then to nothing. */
export interface VetMedicationCatalogItem {
  id: string;
  veterinarian_id: string;
  name: string;
  default_price: number | null;
  default_medicine_type: string | null;
  icon: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMedicationCatalogItemPayload {
  name: string;
  default_price?: number;
  default_medicine_type?: string;
  icon?: string | null;
  image_url?: string | null;
}

export interface UpdateMedicationCatalogItemPayload {
  name?: string;
  default_price?: number | null;
  default_medicine_type?: string | null;
  icon?: string | null;
  image_url?: string | null;
}

// #117: VetProcedureCatalogItem/CreateProcedureCatalogItemPayload/
// UpdateProcedureCatalogItemPayload removed alongside the rest of the
// personal procedure catalog - replaced by the consultation-form-template
// types below.

export interface CreateConsultationFormTemplatePayload {
  name: string;
  fields: ConsultationFormField[];
  is_default?: boolean;
  icon?: string | null;
}

export interface UpdateConsultationFormTemplatePayload {
  name?: string;
  fields?: ConsultationFormField[];
  is_default?: boolean;
  icon?: string | null;
}

/** Custom change: one line of a reusable prescription template - a
 * medication paired with the dose/frequency/duration a vet applies to it
 * when this whole template is pulled into a consultation's Prescription
 * section. `medication_catalog_id`/`name`/`medicine_type` are a snapshot
 * copied in at save-time, not just a foreign-key reference, so the
 * template keeps making sense even if the source catalog entry is later
 * renamed or deleted. */
export interface VetPrescriptionTemplateItem {
  medication_catalog_id: string | null;
  name: string;
  medicine_type: string | null;
  dose: string;
  frequency: string;
  duration?: string | null;
}

/** Custom change: a vet's personal, reusable prescription template -
 * "pull multiple medications, assign the dose and frequency on them" once,
 * then apply the whole set to a consultation in one action. Owner-scoped,
 * same shape as VetMedicationCatalogItem/ConsultationFormTemplate. */
export interface VetPrescriptionTemplate {
  id: string;
  veterinarian_id: string;
  name: string;
  items: VetPrescriptionTemplateItem[];
  created_at: string;
  updated_at: string;
}

export interface CreatePrescriptionTemplatePayload {
  name: string;
  items: VetPrescriptionTemplateItem[];
}

export interface UpdatePrescriptionTemplatePayload {
  name?: string;
  items?: VetPrescriptionTemplateItem[];
}
