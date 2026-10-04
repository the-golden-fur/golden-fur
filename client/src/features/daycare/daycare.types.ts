import type {
  FeedingInstructionPayload,
  HotelStay,
  MedicationInstructionPayload,
  PlayingInstructionPayload,
  WalkingInstructionPayload,
} from '../hotel/hotel.types';

export type DaycareStatus = 'Active' | 'Completed';

/**
 * Custom change (Daycare/Hotel parity): a Daycare session is now literally
 * a `stays` row (stay_type: 'Daycare') - the same shared table a Hotel
 * check-in writes to, including cage assignment and the structured
 * feeding/walking/playing/medication care instructions Hotel already had.
 * Kept as its own exported name (a type alias, not a separate shape) so
 * every existing DaycareSession call site keeps working unchanged.
 */
export type DaycareSession = HotelStay;

/** How a checked-out session's computed_charge was arrived at - sent with
 * the checkout response only (mirrors the server's DaycareChargeBreakdown). */
export interface DaycareChargeBreakdown {
  first_hour_fee: number;
  succeeding_hours: number;
  succeeding_hour_fee: number;
  hourly_charge: number;
  /** Hours past the booked end time, after the grace period - 0 for an
   * on-time pickup or a walk-in. Billed at overdue_hour_fee. */
  overdue_hours: number;
  overdue_hour_fee: number;
  overdue_charge: number;
  /** Closing times the pet was still there for - 0 for a same-day pickup. */
  nights: number;
  /** The branch's Hotel nightly rate; null when nights is 0. */
  nightly_rate: number | null;
  overnight_charge: number;
  total: number;
}

export type DaycareCheckoutResult = DaycareSession & {
  charge_breakdown?: DaycareChargeBreakdown;
};

export type CheckInPayload = (
  | { booking_id: string; pet_id?: never; branch_id?: never }
  | { pet_id: string; branch_id: string; booking_id?: never }
) & {
  cage_id?: string;
  feeding: FeedingInstructionPayload[];
  walking: WalkingInstructionPayload[];
  playing: PlayingInstructionPayload[];
  medications?: MedicationInstructionPayload[];
  notify_opt_in: boolean;
};
