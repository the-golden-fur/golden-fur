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
  /** Custom change (clear check-in gate, groomer rest-day indicator): why
   * this session can't be checked in right now (branch closed today, or
   * the assigned groomer has an approved day off), or null when nothing
   * blocks it. Only computed for the live queue view, not history. */
  check_in_blocked_reason?: string | null;
}
