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

/** Groomer/Pet Assistant advance rights: Daycare has no dedicated assigned-
 * staff role (unlike Grooming/Veterinary), so Groomer and Pet Assistant may
 * also check pets in/out of Daycare - mirrors HOTEL_ADVANCE_ROLES. */
export const DAYCARE_ADVANCE_ROLES: readonly string[] = [
  ...DAYCARE_ROLES,
  'Groomer',
  'Pet Assistant',
];

import type { HotelStay } from '../hotel/hotel.types.ts';

export type DaycareStatus = 'Active' | 'Completed';

/**
 * Custom change (Daycare/Hotel parity): a Daycare session is now literally
 * a `stays` row (stay_type: 'Daycare') - the same shared table a Hotel
 * check-in writes to (migration 20260807104), including cage assignment
 * and the structured feeding/walking/playing/medication care instructions
 * Hotel already had. Kept as its own exported name (a type alias of
 * HotelStay, not a separate shape) so every existing DaycareSession call
 * site across the client/server keeps working unchanged.
 */
export type DaycareSession = HotelStay;
