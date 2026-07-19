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

export type ConsultationStatus = 'Pending' | 'Ongoing' | 'Completed';

/** Array element shape stored on consultations.medications (#63 migration). */
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
