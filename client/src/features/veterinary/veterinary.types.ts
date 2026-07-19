import type { Booking } from '../booking/booking.types';

export type ConsultationStatus = 'Pending' | 'Ongoing' | 'Completed';

export interface ConsultationMedication {
  name: string;
  dose: string;
  notes?: string | null;
}

export interface Consultation {
  id: string;
  booking_id: string;
  pet_id: string;
  veterinarian_id: string;
  status: ConsultationStatus;
  temperature: number | null;
  weight: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  diagnosis: string | null;
  medications: ConsultationMedication[] | null;
  reason_for_visit: string;
  follow_up_date: string | null;
  follow_up_booking_id: string | null;
  completed_at: string | null;
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
