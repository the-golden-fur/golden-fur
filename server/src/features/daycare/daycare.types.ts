/**
 * Feature-local role list (mirrors hotel.types.ts's HOTEL_FRONT_DESK_ROLES -
 * same membership, same purpose, renamed from DAYCARE_ROLES for naming
 * parity). Daycare check-in/checkout is staff-only - no customer-facing
 * access at all (unlike M03 bookings, which customers can read/write
 * directly).
 */
export const DAYCARE_FRONT_DESK_ROLES: readonly string[] = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
  'Front Desk',
];

/**
 * Custom change (Groomer/Pet Assistant check-in restriction): Groomer and
 * Pet Assistant keep Daycare queue visibility and care-task marking, but no
 * longer check pets in/out themselves - DAYCARE_ADVANCE_ROLES now only
 * backs the read/browse routes and care-log-entry status changes, not
 * check-in/checkout (which use DAYCARE_FRONT_DESK_ROLES directly, see
 * daycare.routes.ts). Kept for those still-wide routes rather than removed.
 */
export const DAYCARE_ADVANCE_ROLES: readonly string[] = [
  ...DAYCARE_FRONT_DESK_ROLES,
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

/** How a checked-out session's computed_charge was arrived at - returned
 * with the checkout response only (never stored), so the checkout screen
 * can itemize the bill without re-deriving the formula client-side. */
export interface DaycareChargeBreakdown {
  first_hour_fee: number;
  succeeding_hours: number;
  succeeding_hour_fee: number;
  hourly_charge: number;
  /** Hours past the booking's own scheduled end, after the grace period -
   * 0 for an on-time pickup or a walk-in with no booked end time. Billed at
   * overdue_hour_fee instead of the normal hourly rate. */
  overdue_hours: number;
  overdue_hour_fee: number;
  overdue_charge: number;
  /** Closing times the pet was still there for - 0 for a same-day pickup. */
  nights: number;
  /** The branch's Hotel nightly rate each night is billed at; null when
   * nights is 0 (never looked up). */
  nightly_rate: number | null;
  overnight_charge: number;
  total: number;
}

export type DaycareCheckoutResult = DaycareSession & {
  charge_breakdown: DaycareChargeBreakdown;
  /** Pay at checkout: true when this checkout posted the whole charge to the
   * cashier's Transactions list (the booking had no upfront charge). */
  billed_at_checkout: boolean;
  /** A normal booking's extras this checkout posted to Transactions (extra
   * hours, overdue fee, nights not picked up) - null for a walk-in or a
   * pay-at-checkout booking, whose whole bill is posted instead. */
  added_at_checkout: number | null;
  /** What the booking's Transactions still say is owed after checkout -
   * what the cashier will collect. Null for a walk-in (no booking). */
  /** What the booking's Daycare hours were charged at booking - null for a
   * walk-in or a pay-at-checkout booking. */
  booked_charge: number | null;
  amount_due: number | null;
};

/** The bill a session would get if it were checked out now
 * (previewDaycareCheckout) - the same fields checkout reports, worked out
 * without saving anything. */
export interface DaycareCheckoutPreview {
  charge_breakdown: DaycareChargeBreakdown;
  computed_charge: number;
  booked_charge: number | null;
  added_at_checkout: number | null;
  /** Pending on Transactions now + what checkout would add. */
  amount_due: number | null;
  billed_at_checkout: boolean;
  /** When the preview was worked out (ISO) - the bill keeps growing with
   * every overdue hour. */
  as_of: string;
}
