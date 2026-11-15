import type { Booking } from '../booking/booking.types.ts';
import { HOTEL_FRONT_DESK_ROLES } from '../hotel/hotel.types.ts';

/** Who can open the Front Desk Queue - the same people who check pets in and
 * out, so nobody gains a new kind of authority over Hotel/Daycare here. */
export const FRONT_DESK_QUEUE_ROLES: readonly string[] = HOTEL_FRONT_DESK_ROLES;

/** One booking on the Front Desk Queue. */
export interface FrontDeskQueueRow {
  booking: Booking;
  pet_name: string | null;
  owner_name: string | null;
  assigned_staff_name: string | null;
  completed_by_name: string | null;
  /** The Hotel/Daycare stay, once checked in. */
  stay_id: string | null;
  /** Care tasks due by today that aren't done, for an open stay. Checkout
   * offers to mark these Missed. */
  outstanding_task_count: number;
}
