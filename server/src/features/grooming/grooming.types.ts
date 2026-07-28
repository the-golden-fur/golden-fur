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

/**
 * Booking-status revision: grooming_sessions no longer tracks its own
 * execution state (status/started_at/completed_at columns were dropped by
 * ...059) - the joined booking's status/started_at/completed_at/paid_at
 * (bookings.status) is now the single source of truth. Read it via
 * session.booking.status.
 */
export interface GroomingSession {
  id: string;
  booking_id: string;
  assigned_groomer_id: string;
  queue_position: number | null;
  created_at: string;
  updated_at: string;
  booking?: Booking;
}
