import type {
  BookingStatus,
  ServiceCategory,
} from '../../booking/booking.types.ts';
import type {
  PaymentChoice,
  PaymentMethod,
  PaymentStatus,
  TransactionType,
} from '../../billing/billing.types.ts';

export type PetType = 'Dog' | 'Cat';
export type PetGender = 'Male' | 'Female';
export type PetWeightClass = 'S' | 'M' | 'L' | 'XL';
export type PetCoatType = 'SC' | 'LC' | 'XLC';

/** Why a customer deleted (archived) a pet - mirrors the archive_reason
 * check constraint in ...275_custom_pet_archive_reason.sql. */
export const PET_ARCHIVE_REASONS = [
  'passed_away',
  'rehomed',
  'duplicate',
  'no_longer_using_clinic',
  'other',
] as const;
export type PetArchiveReason = (typeof PET_ARCHIVE_REASONS)[number];

export interface Breed {
  id: string;
  pet_type: PetType;
  name: string;
  created_at: string;
}

export interface Pet {
  id: string;
  customer_id: string;
  name: string;
  pet_type: PetType;
  breed_id: string | null;
  photo_url: string | null;
  gender: PetGender | null;
  date_of_birth: string | null;
  /** NULL until staff records a physical assessment - see
   * ...073_m02_pets_assessment_lock.sql. Only staff (Receptionist/Admin/
   * Supervisor/Superadmin) may set these; customers cannot. */
  weight_class: PetWeightClass | null;
  /** Canonical weight in kilograms, recorded on-site during assessment (the
   * client converts from lbs if that's how staff entered it). NULL = no
   * numeric weight yet. weight_class is derived from this on write unless
   * staff send an explicit override. Staff-only writable, same as
   * weight_class. See ...185_m02_pets_add_weight_kg.sql. */
  weight_kg: number | null;
  coat_type: PetCoatType | null;
  assessed_by: string | null;
  assessed_at: string | null;
  is_active: boolean;
  archived_at: string | null;
  /** Set when archived, cleared on restore. Not displayed yet - reserved
   * for a future Trends tab. archive_reason_other is only set for 'other'. */
  archive_reason: PetArchiveReason | null;
  archive_reason_other: string | null;
  created_at: string;
  updated_at: string;
}

export interface PetHealthCondition {
  id: string;
  pet_id: string;
  conditions_text: string | null;
  updated_by_staff_id: string;
  updated_at: string;
}

/** 'verified': entered by staff, or a customer's record staff confirmed.
 * 'pending': added by the owner, awaiting review. 'rejected': staff turned
 * it down (see rejection_reason). Information only - nothing in booking
 * reads it (20261021277). */
export type VaccinationRecordStatus = 'verified' | 'pending' | 'rejected';

export interface PetVaccinationRecord {
  id: string;
  pet_id: string;
  vaccine_name: string;
  date_administered: string;
  next_due_date: string | null;
  administered_by: string | null;
  notes: string | null;
  created_at: string;
  status: VaccinationRecordStatus;
  /** Set when the pet's owner added it themselves. */
  reported_by_customer_id: string | null;
  /** The card photo's path in the private 'vaccination-proofs' bucket. */
  proof_path: string | null;
  reviewed_by_staff_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  /** Short-lived signed link to the card photo - added when read, never
   * stored. */
  proof_url?: string | null;
}

/** A pending record in the staff review queue, with display names. */
export interface PendingVaccinationRecord extends PetVaccinationRecord {
  pet_name: string | null;
  owner_name: string | null;
}

export type MedicalNoteCategory =
  | 'Medical Note'
  | 'Allergy'
  | 'Behavioral Flag';

export interface PetMedicalNote {
  id: string;
  pet_id: string;
  note_text: string;
  category: MedicalNoteCategory;
  staff_id: string;
  created_at: string;
}

/** #117: a customer's trimmed view of one finished consultation's
 * prescribed medications - deliberately narrower than the full Consultation
 * row (no vitals/diagnosis/professional_fee), mirroring how
 * PetHealthCondition/PetMedicalNote already expose only their own narrow
 * slice to customers, not the whole underlying record. Built/returned by
 * server/src/features/veterinary/services/consultation.service.ts's
 * listPetPrescriptionsForRequester - defined here (not in the veterinary
 * feature) for the same reason PetHealthCondition is, since it's read
 * through the pets feature's customer-facing routes. */
export interface PetPrescriptionHistoryEntry {
  consultation_id: string;
  date: string;
  /** Pharmacy prescriptions: who prescribed it and where - what a printed
   * prescription shows when the customer buys from another pharmacy. Null
   * only if that staff/branch row can no longer be found. */
  veterinarian_name: string | null;
  branch_name: string | null;
  branch_address: string | null;
  pet_name: string | null;
  owner_name: string | null;
  medications: Array<{
    name: string;
    dose: string;
    notes?: string | null;
    medicine_type?: string | null;
    strength?: string | null;
    frequency?: string | null;
    duration?: string | null;
    quantity?: number | null;
    quantity_unit?: string | null;
    refills?: number | null;
  }>;
}

/** One past booking on a pet's Service History - Completed, Cancelled or
 * No-show only (upcoming bookings live on the Bookings page). Built by
 * services/petServiceHistory.service.ts; read by both the owning customer and
 * staff, so it stays a flat display slice rather than the whole booking. */
export interface PetServiceHistoryEntry {
  booking_id: string;
  /** completed_at when the service finished, else scheduled_start. */
  date: string;
  service_category: ServiceCategory;
  status: Extract<BookingStatus, 'Completed' | 'Cancelled' | 'No-show'>;
  /** Service/package names from booking_items. */
  items: string[];
  branch_name: string | null;
  /** Assigned groomer/vet; null for Hotel/Daycare/Assessment. */
  staff_name: string | null;
  total_price: number;
  cancellation_reason: string | null;
  /** Paid (Partially/Fully) transactions for this booking - its own, plus a
   * multi-booking checkout's group transaction - oldest first. Each one is a
   * reprintable receipt. */
  payments: PetServiceHistoryPayment[];
}

/** The slice of a transaction its printed receipt needs. Field names match
 * the client's TransactionRecord so the same receipt builder reads both. */
export interface PetServiceHistoryPayment {
  id: string;
  booking_id: string | null;
  booking_group_id: string | null;
  branch_id: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  payment_status: Exclude<PaymentStatus, 'Pending'>;
  payment_choice: PaymentChoice | null;
  total_amount: number;
  misc_sale_description: string | null;
  created_at: string;
  customer_name: string | null;
  bookings: {
    service_category: ServiceCategory;
    pets: { name: string } | null;
  } | null;
  transaction_line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

/** #117: a customer's trimmed view of one finished consultation's filled-in
 * consultation-form results. See PetPrescriptionHistoryEntry above for why
 * this type lives here and why it's narrower than the full Consultation
 * row. Custom change: 'prescription' field type added, and `value` widened
 * to also hold a medication list (same per-item shape as
 * PetPrescriptionHistoryEntry's `medications` above) - a 'prescription'-type
 * field's filled-in value. */
export interface PetConsultationResultEntry {
  consultation_id: string;
  date: string;
  form_responses: Array<{
    template_id: string | null;
    template_name: string;
    filled_at: string;
    fields: Array<{
      field_id: string;
      label: string;
      type:
        | 'text'
        | 'textarea'
        | 'number'
        | 'select'
        | 'checkbox'
        | 'date'
        | 'prescription';
      value:
        | string
        | number
        | boolean
        | null
        | Array<{
            name: string;
            dose: string;
            notes?: string | null;
            medicine_type?: string | null;
            frequency?: string | null;
            duration?: string | null;
          }>;
    }>;
  }>;
}
