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
