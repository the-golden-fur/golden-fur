import type { Booking } from '../booking/booking.types';

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
