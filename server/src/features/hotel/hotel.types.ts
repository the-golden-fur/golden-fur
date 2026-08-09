/**
 * Feature-local role lists (mirrors daycare.types.ts / grooming.types.ts).
 * Front-desk roles can check in, edit care instructions, and process
 * checkout; Pet Assistant/Groomer may only mark Boarding Checklist entries
 * Pending/In Progress/Completed (enforced separately in hotel.routes.ts,
 * not folded into this one list).
 */
export const HOTEL_FRONT_DESK_ROLES: readonly string[] = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
];

/** Custom change (Boarding Checklist): Groomer added alongside Pet
 * Assistant - "should be also visible on groomer role" (the checklist now
 * covers Hotel and Daycare, not just the Pet Assistant's original Hotel-
 * only scope). Name kept for now to avoid a wider rename ripple. */
export const HOTEL_PET_ASSISTANT_ROLES: readonly string[] = [
  'Pet Assistant',
  'Groomer',
];

export const HOTEL_ADMIN_ROLES: readonly string[] = ['Admin', 'Superadmin'];

/** Groomer/Pet Assistant advance rights: Hotel has no dedicated assigned-
 * staff role (unlike Grooming/Veterinary), so Groomer and Pet Assistant may
 * also check pets in/out and browse the stay/cage lists needed to do that -
 * everything else (cage maintenance status, the flagged Care Log view) stays
 * front-desk/admin only. */
export const HOTEL_ADVANCE_ROLES: readonly string[] = [
  ...HOTEL_FRONT_DESK_ROLES,
  'Groomer',
  'Pet Assistant',
];

export type CageSize = 'S' | 'M' | 'L' | 'XL';
export type CageStatus =
  | 'Available'
  | 'Occupied'
  | 'Reserved'
  | 'Under Maintenance';
export type MealTime = 'Morning' | 'Noon' | 'Afternoon' | 'Evening';
export type PartOfDay = 'Morning' | 'Afternoon' | 'Evening';
export type CareType = 'Feeding' | 'Walking' | 'Medication' | 'Playing';
export type StayType = 'Hotel' | 'Daycare';
export type StayStatus = 'Active' | 'Completed';

export interface Cage {
  id: string;
  branch_id: string;
  cage_label: string;
  size: CageSize;
  status: CageStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Custom change (Daycare/Hotel parity): renamed from hotel_stays to `stays`
 * (migration 20260807104) - a Daycare check-in now writes the exact same
 * row shape (stay_type: 'Daycare'), sharing cage assignment and the
 * feeding/walking/playing/medication care instructions Hotel already had.
 * Kept exported as `HotelStay` (not renamed to `Stay`) to avoid rippling
 * the rename through every existing Hotel call site - daycare.types.ts's
 * `DaycareSession` is a type alias of this same interface instead of a
 * separate shape.
 */
export interface HotelStay {
  id: string;
  stay_type: StayType;
  /** NULL only for a Daycare walk-in (no booking) - always set for Hotel. */
  booking_id: string | null;
  pet_id: string;
  branch_id: string;
  cage_id: string;
  status: StayStatus;
  check_in_at: string | null;
  /** Hotel-only; NULL for Daycare. */
  scheduled_check_out_date: string | null;
  actual_check_out_at: string | null;
  /** Hotel-only; NULL for Daycare. */
  downpayment_amount: number | null;
  extension_fee: number | null;
  /** Daycare-only (per-elapsed-hour/night charge, computed at checkout);
   * NULL for Hotel, which bills via downpayment_amount/extension_fee. */
  computed_charge: number | null;
  /** Custom change (Daycare fee configuration): the service this stay's
   * fee schedule comes from - Daycare-only in practice today (resolved at
   * check-in from the booking's selected service, an explicit walk-in
   * choice, or the branch's first active Daycare service). NULL for Hotel
   * stays (unused there) and for any Daycare stay predating this column. */
  service_id: string | null;
  notify_opt_in: boolean;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
}

// FoodCatalogItem/MedicationCatalogItem moved to features/catalog/
// catalog.types.ts's ProductCatalogItem (Sprint 5 unification, #82) - the
// food_catalog_id/medication_catalog_id fields below now reference
// product_catalog rows.

export interface CareFeedingInstruction {
  id: string;
  stay_id: string;
  meal_time: MealTime;
  food_type: string;
  quantity: string;
  special_instructions: string | null;
  food_catalog_id: string | null;
  /** Null = applies to every night of the stay; a date scopes this row to
   * that single calendar night (#22 per-night care instructions). */
  stay_date: string | null;
}

export interface CareWalkingInstruction {
  id: string;
  stay_id: string;
  time_block: PartOfDay;
  duration_minutes: number;
  notes: string | null;
  stay_date: string | null;
}

export interface CarePlayingInstruction {
  id: string;
  stay_id: string;
  time_block: PartOfDay;
  duration_minutes: number;
  notes: string | null;
  stay_date: string | null;
}

export interface CareMedicationInstruction {
  id: string;
  stay_id: string;
  medication_name: string;
  dose: string;
  scheduled_times: string[];
  administration_notes: string | null;
  source_prescription_note: string | null;
  medication_catalog_id: string | null;
  stay_date: string | null;
}

export interface CareLogEntry {
  id: string;
  stay_id: string;
  care_type: CareType;
  scheduled_date: string;
  description: string;
  /** Custom change (Boarding Checklist): the Morning/Noon/Afternoon/Evening
   * block this task falls in - null only for a handful of pre-migration
   * rows the backfill couldn't confidently parse (see migration
   * 20260809120) or a Medication row with no real scheduled time
   * ('as scheduled'). */
  time_block: MealTime | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  /** Only populated by getTodayCareLogEntries's join (#80 AC-2) - other
   * queries in this feature don't need the completing staff member's name. */
  completed_by_staff?: { display_name: string } | null;
  /** Custom change (Boarding Checklist): only populated by
   * getTodayCareLogEntries's join - pet name + which kind of stay
   * (Hotel/Daycare) this task belongs to, for display/subtab filtering. */
  stays?: { stay_type: 'Hotel' | 'Daycare'; pet_id: string } | null;
}

export interface CheckInResult {
  stay: HotelStay;
  feeding: CareFeedingInstruction[];
  walking: CareWalkingInstruction[];
  playing: CarePlayingInstruction[];
  medications: CareMedicationInstruction[];
  careLogEntries: CareLogEntry[];
}

export interface CheckoutResult {
  stay: HotelStay;
  downpaymentAmount: number;
  extensionFee: number | null;
  remainingBalance: number;
}
