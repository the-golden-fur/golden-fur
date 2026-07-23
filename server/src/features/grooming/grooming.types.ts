import type { Booking } from '../booking/booking.types.ts';

/**
 * Feature-local role list (mirrors booking.types.ts / staff.types.ts).
 * Groomer reads/transitions only their own assigned sessions (enforced in
 * grooming.service.ts + RLS, ...038); Admin/Supervisor/Superadmin see and
 * transition any session at their branch (Superadmin: all branches).
 */
export const GROOMING_QUEUE_ROLES: readonly string[] = [
  'Groomer',
  'Admin',
  'Supervisor',
  'Superadmin',
];

export type GroomingStatus = 'Waiting' | 'In Progress' | 'Completed';

export interface GroomingSession {
  id: string;
  booking_id: string;
  assigned_groomer_id: string;
  status: GroomingStatus;
  queue_position: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  booking?: Booking;
}
