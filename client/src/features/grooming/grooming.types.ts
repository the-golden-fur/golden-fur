import type { Booking } from '../booking/booking.types';

/**
 * Booking-status revision: grooming_sessions no longer tracks its own
 * execution state - the joined booking's status/started_at/completed_at/
 * paid_at (bookings.status) is now the single source of truth. Read it via
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
