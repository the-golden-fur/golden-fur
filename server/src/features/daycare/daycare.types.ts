/**
 * Feature-local role list (mirrors booking.types.ts / staff.types.ts).
 * Daycare check-in/checkout is staff-only - no customer-facing access at all
 * (unlike M03 bookings, which customers can read/write directly).
 */
export const DAYCARE_ROLES: readonly string[] = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
];

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
