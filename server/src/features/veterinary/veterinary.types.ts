import type { Booking } from '../booking/booking.types.ts';

/**
 * Feature-local role lists (mirrors grooming.types.ts / daycare.types.ts).
 * Any Veterinarian may view/edit any consultation - no per-pet assigned-vet
 * restriction (#66 dev notes); Admin/Supervisor/Superadmin/Receptionist may
 * only read (RLS from #63 grants Receptionist SELECT, not INSERT/UPDATE).
 */
export const VETERINARY_READ_ROLES: readonly string[] = [
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
  'Receptionist',
];

export const VETERINARY_WRITE_ROLES: readonly string[] = ['Veterinarian'];

/** Array element shape stored on consultations.medications (#63 migration).
 * #117: medicine_type/frequency/duration added so this row is a real
 * prescription (medicine type, dosage, frequency), not just name+dose - all
 * three are free text (see veterinary.validator.ts), not DB/Zod enums, so a
 * vet is never blocked from entering something outside the client's
 * suggested-value lists. */
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
 * Custom change: 'prescription' added - a field of this type fills in with
 * a whole editable medication list (ConsultationMedication[]), not a
 * scalar value - see ConsultationFormFieldResponse.value below. */
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
 * scoped (RLS: auth.uid() = veterinarian_id), same shape as
 * VetMedicationCatalogItem below. `is_default` - exactly one per vet
 * (enforced in consultationFormTemplate.service.ts, not the DB) - is
 * auto-offered the first time a fresh consultation is opened. `icon`
 * (custom change): a curated Lucide icon name, same allowlist/component as
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
 * copied from the source template at fill-time (not re-read from it later),
 * so a past visit's results keep reading correctly even after the source
 * template is edited or deleted. Custom change: `value` widened to also
 * hold a medication list - a 'prescription'-type field's filled-in value. */
export interface ConsultationFormFieldResponse {
  field_id: string;
  label: string;
  type: ConsultationFormField['type'];
  value: string | number | boolean | null | ConsultationMedication[];
}

/** #117: one filled-in consultation-form template, stored in
 * consultations.form_responses (an array - a visit can have more than one
 * filled-in result, e.g. both a "Dental Check" and a "Behavior Notes"
 * template). template_id is kept only as a "was this ever deleted" pointer,
 * never as the source of truth for display - template_name and every
 * field's label/type are already snapshotted above. */
export interface ConsultationFormResponse {
  template_id: string | null;
  template_name: string;
  filled_at: string;
  fields: ConsultationFormFieldResponse[];
}

/**
 * Booking-status revision: consultations.status/completed_at were dropped
 * (M07 migration) - the consultation's execution state now lives entirely
 * on the joined booking's bookings.status/completed_at instead.
 */
export interface Consultation {
  id: string;
  booking_id: string;
  pet_id: string;
  veterinarian_id: string;
  /** The vet who took this consultation (20261006248) - null until one
   * does. Once set, only that vet may edit or complete it. */
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

export type ProcedureType =
  | 'Lab test'
  | 'Dental'
  | 'Vaccination'
  | 'Surgery'
  | 'Emergency'
  | 'Wellness Exam';

export type ConsultationLineItemType =
  | 'professional_fee'
  | 'medication'
  | 'procedure';

export interface ConsultationLineItem {
  id: string;
  consultation_id: string;
  item_type: ConsultationLineItemType;
  procedure_type: ProcedureType | null;
  description: string;
  amount: number;
}

export interface CurrentPrescription {
  consultation_id: string;
  completed_at: string;
  medications: ConsultationMedication[];
}

/** "My Patients": one row per distinct pet a veterinarian has finished a
 * consultation for, with that pet's most recent finished-visit date.
 * customer_id (the pet's owner) is included so the Bookings Queue's New
 * Booking flow can restrict a Veterinarian's Customer step to owners they've
 * actually treated (vet-bookings-queue-access), without a separate
 * pet-to-owner lookup. */
export interface VeterinarianPatient {
  pet_id: string;
  customer_id: string;
  last_visit_at: string;
}

/** A veterinarian's personal medication catalog entry - owner-scoped
 * (RLS: auth.uid() = veterinarian_id), unlike everything else in this
 * feature which any Veterinarian may view/edit. Custom change ("My Catalog"
 * broken into Medications/Prescriptions/Forms): a medication is now just a
 * product definition (name/type/price) - `default_dose`/`default_frequency`
 * removed, since dose and frequency belong to a *prescription* (a specific
 * patient's visit), not the medicine itself. See
 * VetPrescriptionTemplate below for where those moved.
 * `icon`/`image_url` (custom change): a curated Lucide icon name (see
 * veterinary.validator.ts's MEDICATION_ICON_NAMES, kept in lockstep with
 * client/src/shared/components/IconPicker/serviceIcons.ts) and/or an
 * uploaded image, same pattern services/service types/packages already use
 * - a Board/gallery card renders `image_url` as its background when set,
 * falling back to `icon`, then to nothing. */
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

// VetProcedureCatalogItem removed (#117: "the procedures in vet staff > my
// catalog dropped, since it will have no use") - the personal
// vet_procedure_catalog table is dropped in
// 20260929230_custom_drop_vet_procedure_catalog.sql. ProcedureType/
// ConsultationLineItemType/ConsultationLineItem above are kept, since they
// still describe already-completed consultations' historical billing rows.

/** Custom change: one line of a reusable prescription template - a
 * medication paired with the dose/frequency/duration a vet applies to it
 * when this whole template is pulled into a consultation's Prescription
 * section. `medication_catalog_id`/`name`/`medicine_type` are a snapshot
 * (name/medicine_type copied in at save-time), not just a foreign-key
 * reference, so the template keeps reading correctly even if the source
 * vet_medication_catalog row is later renamed or deleted -
 * medication_catalog_id is kept only as a "was this ever deleted" pointer,
 * same convention as ConsultationFormResponse.template_id. */
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
 * then apply the whole set to a consultation in one action instead of
 * adding each medication one at a time every visit. Owner-scoped, same
 * shape as VetMedicationCatalogItem/ConsultationFormTemplate. */
export interface VetPrescriptionTemplate {
  id: string;
  veterinarian_id: string;
  name: string;
  items: VetPrescriptionTemplateItem[];
  created_at: string;
  updated_at: string;
}
