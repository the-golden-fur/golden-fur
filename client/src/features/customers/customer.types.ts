export type CommunicationChannel = 'Call' | 'Text' | 'Viber' | 'Messenger';

export interface CustomerProfile {
  id: string;
  full_name: string;
  contact_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  preferred_communication_channel: CommunicationChannel | null;
  account_email: string;
  primary_auth_provider: 'email' | 'google' | 'facebook';
  facebook_id: string | null;
  is_active: boolean;
  archived_at: string | null;
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
export type PetCoatType = 'SC' | 'LC';

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
  gender?: PetGender;
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
