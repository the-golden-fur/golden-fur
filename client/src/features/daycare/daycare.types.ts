export type DaycareStatus = 'Active' | 'Completed';

export interface DaycareSession {
  id: string;
  booking_id: string | null;
  pet_id: string;
  branch_id: string;
  created_by_staff_id: string;
  status: DaycareStatus;
  check_in_at: string;
  check_out_at: string | null;
  computed_charge: number | null;
  created_at: string;
  updated_at: string;
}

export type CheckInPayload =
  | { booking_id: string }
  | { pet_id: string; branch_id: string };
