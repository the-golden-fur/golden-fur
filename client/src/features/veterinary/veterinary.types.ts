import type { Booking } from '../booking/booking.types';

export interface ConsultationMedication {
  name: string;
  dose: string;
  notes?: string | null;
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
  temperature: number | null;
  weight: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  diagnosis: string | null;
  medications: ConsultationMedication[] | null;
  reason_for_visit: string;
  follow_up_date: string | null;
  follow_up_booking_id: string | null;
  created_at: string;
  updated_at: string;
  booking?: Booking;
}

export const PROCEDURE_TYPES = [
  'Lab test',
  'Dental',
  'Vaccination',
  'Surgery',
  'Emergency',
  'Wellness Exam',
] as const;

export type ProcedureType = (typeof PROCEDURE_TYPES)[number];

export interface MedicationInput {
  name: string;
  dose: string;
  notes?: string;
  /** Only required to complete a consultation (#66 AC-2). */
  amount?: number;
}

export interface ProcedureInput {
  procedure_type: ProcedureType;
  description: string;
  amount: number;
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
  procedures?: ProcedureInput[];
  professional_fee?: number;
  vaccination?: VaccinationInput;
}

export interface ScheduleFollowUpResult {
  consultation: Consultation;
  booking: Booking;
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
 * date. */
export interface VeterinarianPatient {
  pet_id: string;
  last_visit_at: string;
}

/** A veterinarian's personal medication/procedure catalog entry -
 * owner-scoped, only the veterinarian who created it can see or edit it. */
export interface VetMedicationCatalogItem {
  id: string;
  veterinarian_id: string;
  name: string;
  default_dose: string | null;
  default_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMedicationCatalogItemPayload {
  name: string;
  default_dose?: string;
  default_price?: number;
}

export interface UpdateMedicationCatalogItemPayload {
  name?: string;
  default_dose?: string | null;
  default_price?: number | null;
}

export interface VetProcedureCatalogItem {
  id: string;
  veterinarian_id: string;
  procedure_type: ProcedureType;
  description: string;
  default_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProcedureCatalogItemPayload {
  procedure_type: ProcedureType;
  description: string;
  default_price?: number;
}

export interface UpdateProcedureCatalogItemPayload {
  procedure_type?: ProcedureType;
  description?: string;
  default_price?: number | null;
}
