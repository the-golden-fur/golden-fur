/**
 * Feature-local role lists (mirrors daycare.types.ts / grooming.types.ts).
 * Front-desk roles can check in, edit care instructions, and process
 * checkout; Pet Assistant may only mark Care Log entries complete
 * (enforced separately in hotel.routes.ts, not folded into this one list).
 */
export const HOTEL_FRONT_DESK_ROLES: readonly string[] = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
];

export const HOTEL_PET_ASSISTANT_ROLES: readonly string[] = ['Pet Assistant'];

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
export type MealTime = 'Morning' | 'Afternoon' | 'Evening';
export type PartOfDay = 'Morning' | 'Afternoon' | 'Evening';
export type CareType = 'Feeding' | 'Walking' | 'Medication' | 'Playing';

export interface Cage {
  id: string;
  branch_id: string;
  cage_label: string;
  size: CageSize;
  status: CageStatus;
  created_at: string;
  updated_at: string;
}

export interface HotelStay {
  id: string;
  booking_id: string;
  pet_id: string;
  cage_id: string;
  check_in_at: string | null;
  scheduled_check_out_date: string;
  actual_check_out_at: string | null;
  downpayment_amount: number;
  extension_fee: number | null;
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
  hotel_stay_id: string;
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
  hotel_stay_id: string;
  time_block: PartOfDay;
  duration_minutes: number;
  notes: string | null;
  stay_date: string | null;
}

export interface CarePlayingInstruction {
  id: string;
  hotel_stay_id: string;
  time_block: PartOfDay;
  duration_minutes: number;
  notes: string | null;
  stay_date: string | null;
}

export interface CareMedicationInstruction {
  id: string;
  hotel_stay_id: string;
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
  hotel_stay_id: string;
  care_type: CareType;
  scheduled_date: string;
  description: string;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  /** Only populated by getTodayCareLogEntries's join (#80 AC-2) - other
   * queries in this feature don't need the completing staff member's name. */
  completed_by_staff?: { display_name: string } | null;
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
