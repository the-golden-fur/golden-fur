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

export type PetSpecies = 'Dog' | 'Cat';
export type PetGender = 'Male' | 'Female';
export type PetWeightClass = 'S' | 'M' | 'L' | 'XL';
export type PetCoatType = 'SC' | 'LC';

export interface Pet {
  id: string;
  customer_id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  gender: PetGender | null;
  date_of_birth: string | null;
  weight_class: PetWeightClass;
  coat_type: PetCoatType;
  health_conditions: string | null;
  created_at: string;
  updated_at: string;
}

export interface PetCreatePayload {
  name: string;
  species: PetSpecies;
  weight_class: PetWeightClass;
  coat_type: PetCoatType;
  breed?: string;
  gender?: PetGender;
  date_of_birth?: string;
  health_conditions?: string;
}

export type PetUpdatePayload = Partial<PetCreatePayload>;

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
