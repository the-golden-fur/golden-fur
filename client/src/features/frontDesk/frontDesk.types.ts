import type { Booking } from '../booking/booking.types';

/** One booking on the Front Desk Queue - mirrors the server's
 * FrontDeskQueueRow. */
export interface FrontDeskQueueRow {
  booking: Booking;
  pet_name: string | null;
  owner_name: string | null;
  assigned_staff_name: string | null;
  completed_by_name: string | null;
  stay_id: string | null;
  outstanding_task_count: number;
}

export type FrontDeskAction =
  | 'assess'
  | 'start'
  | 'complete'
  | 'check-in'
  | 'check-out';

export interface FrontDeskRowActions {
  action: FrontDeskAction | null;
  /** Why the row can't move yet, shown in place of a button. */
  blockedReason: string | null;
}
