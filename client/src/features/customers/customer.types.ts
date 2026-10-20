import type { BookingStatus, ServiceCategory } from '../booking/booking.types';

export type CommunicationChannel = 'Call' | 'Text' | 'Viber' | 'Messenger';

export interface CustomerProfile {
  id: string;
  full_name: string;
  contact_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  preferred_communication_channel: CommunicationChannel | null;
  account_email: string;
  primary_auth_provider: 'email' | 'google';
  profile_photo_url: string | null;
  is_active: boolean;
  archived_at: string | null;
  deactivated_at: string | null;
  anonymized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerProfileUpdatePayload {
  full_name?: string;
  contact_number?: string;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  preferred_communication_channel?: CommunicationChannel;
}

/**
 * No longer a fixed 2-value union - pet_type is a foreign key against the
 * admin-managed pet_types table (Pet Types admin CRUD, 20260912191), so the
 * seeded 'Dog'/'Cat' values keep working unchanged but an admin can add more.
 */
export type PetType = string;
export type PetGender = 'Male' | 'Female';
export type PetWeightClass = 'S' | 'M' | 'L' | 'XL';
export type PetCoatType = 'SC' | 'LC' | 'XLC';

/** Every coat type staff can record, in display order - the one list the
 * pet and assessment forms all offer. */
export const PET_COAT_TYPES: PetCoatType[] = ['SC', 'LC', 'XLC'];

export const PET_COAT_TYPE_LABEL: Record<PetCoatType, string> = {
  SC: 'Short coat',
  LC: 'Long coat',
  XLC: 'Extra long coat',
};

export interface Breed {
  id: string;
  pet_type: PetType;
  name: string;
  created_at: string;
}

/** Custom change: Pet Types admin CRUD (20260912191). `key` is free-text and
 * immutable once created - pets.pet_type and breeds.pet_type both reference
 * it. Read here via open RLS (same shape as Breed above) for the pet
 * intake/edit dropdowns; admin CRUD goes through maintenance.api.ts. */
export interface PetTypeRow {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  /** NULL until staff records a physical assessment onsite - a customer can
   * never set these (server-enforced, see pet.controller.ts). */
  weight_class: PetWeightClass | null;
  /** Canonical weight in kilograms, recorded on-site during assessment. NULL
   * = no numeric weight yet. weight_class is derived from this; a customer
   * can never set it (server-enforced). Display it via the viewer's kg/lbs
   * preference - see shared/utils/petWeight.ts. */
  weight_kg: number | null;
  coat_type: PetCoatType | null;
  assessed_by: string | null;
  assessed_at: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Customer-facing create payload - weight_class/coat_type are staff-only,
 * see PetCreatePayloadStaff. */
export interface PetCreatePayload {
  name: string;
  pet_type: PetType;
  breed_id?: string;
  gender: PetGender;
  date_of_birth?: string;
}

export interface PetCreatePayloadStaff extends PetCreatePayload {
  /** Canonical kilograms. When sent, the server derives weight_class from it
   * unless weight_class is also sent (an explicit staff override). */
  weight_kg?: number;
  weight_class?: PetWeightClass;
  coat_type?: PetCoatType;
}

export type PetUpdatePayload = Partial<PetCreatePayload>;
export type PetUpdatePayloadStaff = Partial<PetCreatePayloadStaff>;

export interface PetHealthCondition {
  id: string;
  pet_id: string;
  conditions_text: string | null;
  updated_by_staff_id: string;
  updated_at: string;
}

export type MedicalNoteCategory =
  | 'Medical Note'
  | 'Allergy'
  | 'Behavioral Flag';

export interface PetVaccinationRecord {
  id: string;
  pet_id: string;
  vaccine_name: string;
  date_administered: string;
  next_due_date: string | null;
  administered_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface PetMedicalNote {
  id: string;
  pet_id: string;
  note_text: string;
  category: MedicalNoteCategory;
  staff_id: string;
  created_at: string;
}

/** #117: a customer's trimmed view of one finished consultation's
 * prescribed medications - no vitals/diagnosis/professional_fee, mirroring
 * how PetHealthCondition/PetMedicalNote already expose only their own
 * narrow slice. Server: GET /pets/:id/prescriptions. */
export interface PetPrescriptionHistoryEntry {
  consultation_id: string;
  date: string;
  /** Pharmacy prescriptions: who prescribed it and where - shown on the
   * printed prescription a customer takes to another pharmacy. */
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

/** One past booking on a pet's Service History (Completed, Cancelled or
 * No-show). Server: GET /pets/:id/service-history. */
export interface PetServiceHistoryEntry {
  booking_id: string;
  /** completed_at when the service finished, else scheduled_start. */
  date: string;
  service_category: ServiceCategory;
  status: Extract<BookingStatus, 'Completed' | 'Cancelled' | 'No-show'>;
  items: string[];
  branch_name: string | null;
  /** Assigned groomer/vet; null for Hotel/Daycare/Assessment. */
  staff_name: string | null;
  total_price: number;
  cancellation_reason: string | null;
  /** Paid transactions for this booking (its own + a group checkout's),
   * oldest first - each one a reprintable receipt. */
  payments: PetServiceHistoryPayment[];
}

/** The slice of a transaction its printed receipt needs - same field names
 * as reports' TransactionRecord, so receiptPropsFor reads it directly. */
export interface PetServiceHistoryPayment {
  id: string;
  booking_id: string | null;
  booking_group_id: string | null;
  branch_id: string;
  transaction_type: string;
  payment_method: string;
  payment_status: 'Partially Paid' | 'Fully Paid';
  payment_choice: string | null;
  total_amount: number;
  misc_sale_description: string | null;
  created_at: string;
  customer_name: string | null;
  bookings: {
    service_category: string;
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
 * consultation-form results. Server: GET /pets/:id/consultation-results. */
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
      type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
      value: string | number | boolean | null;
    }>;
  }>;
}
