export type PetType = 'Dog' | 'Cat';
export type PetGender = 'Male' | 'Female';
export type PetWeightClass = 'S' | 'M' | 'L' | 'XL';
export type PetCoatType = 'SC' | 'LC';

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
  coat_type: PetCoatType | null;
  assessed_by: string | null;
  assessed_at: string | null;
  is_active: boolean;
  archived_at: string | null;
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
