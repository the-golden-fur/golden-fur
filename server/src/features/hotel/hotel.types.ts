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

export type CageSize = 'S' | 'M' | 'L' | 'XL';
export type CageStatus =
  | 'Available'
  | 'Occupied'
  | 'Reserved'
  | 'Under Maintenance';
export type MealTime = 'Morning' | 'Afternoon' | 'Evening';
export type CareType = 'Feeding' | 'Walking' | 'Medication';

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
  /** Sum of hotel-supplied (brought_by_customer = false) care-instruction
   * charges, computed at checkout - NULL means nothing was hotel-supplied,
   * never zero (mirrors extension_fee's NULL-vs-value convention). */
  supplied_items_charge: number | null;
  notify_opt_in: boolean;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
}

export interface FoodCatalogItem {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicationCatalogItem {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CareFeedingInstruction {
  id: string;
  hotel_stay_id: string;
  meal_time: MealTime;
  food_type: string;
  quantity: string;
  special_instructions: string | null;
  food_catalog_id: string | null;
  brought_by_customer: boolean;
  charged_price: number | null;
}

export interface CareWalkingInstruction {
  id: string;
  hotel_stay_id: string;
  time_block: string;
  duration_minutes: number;
  notes: string | null;
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
  brought_by_customer: boolean;
  charged_price: number | null;
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
  medications: CareMedicationInstruction[];
  careLogEntries: CareLogEntry[];
}

export interface CheckoutResult {
  stay: HotelStay;
  downpaymentAmount: number;
  extensionFee: number | null;
  suppliedItemsCharge: number | null;
  remainingBalance: number;
}
