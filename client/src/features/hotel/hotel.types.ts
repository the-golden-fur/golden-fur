export type CageSize = 'S' | 'M' | 'L' | 'XL';
export type CageStatus =
  | 'Available'
  | 'Occupied'
  | 'Reserved'
  | 'Under Maintenance';
export type MealTime = 'Morning' | 'Afternoon' | 'Evening';
export type PartOfDay = 'Morning' | 'Afternoon' | 'Evening';

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

// Sprint 5 unification (#82): both catalogs are now read-only slices of the
// shared product_catalog table (see features/catalog/catalog.types.ts's
// ProductCatalogItem) - kept as local, minimal types here since
// HotelCheckInPage's pickers only ever need id/name/price/is_active.

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

/** stay_date omitted = applies to every night of the stay; a specific date
 * scopes the row to that single night only (#22). */
export interface FeedingInstructionPayload {
  meal_time: MealTime;
  food_type: string;
  quantity: string;
  special_instructions?: string;
  food_catalog_id?: string;
  stay_date?: string;
}

export interface WalkingInstructionPayload {
  time_block: PartOfDay;
  duration_minutes: number;
  notes?: string;
  stay_date?: string;
}

export interface PlayingInstructionPayload {
  time_block: PartOfDay;
  duration_minutes: number;
  notes?: string;
  stay_date?: string;
}

export interface MedicationInstructionPayload {
  medication_name: string;
  dose: string;
  scheduled_times: string[];
  administration_notes?: string;
  medication_catalog_id?: string;
  stay_date?: string;
}

export interface CareLogEntry {
  id: string;
  hotel_stay_id: string;
  care_type: 'Feeding' | 'Walking' | 'Medication' | 'Playing';
  scheduled_date: string;
  description: string;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  completed_by_staff?: { display_name: string } | null;
}

export interface CheckInPayload {
  booking_id: string;
  cage_id?: string;
  feeding: FeedingInstructionPayload[];
  walking: WalkingInstructionPayload[];
  playing: PlayingInstructionPayload[];
  medications?: MedicationInstructionPayload[];
  notify_opt_in: boolean;
}

export interface CheckInResult {
  stay: HotelStay;
  feeding: FeedingInstructionPayload[];
  walking: WalkingInstructionPayload[];
  playing: PlayingInstructionPayload[];
  medications: MedicationInstructionPayload[];
  careLogEntries: CareLogEntry[];
}

export interface CageSuggestion {
  suggestedSize: CageSize;
  availableCages: Cage[];
}

export interface CurrentPrescription {
  consultation_id: string;
  completed_at: string;
  medications: Array<{ name: string; dose: string; notes?: string | null }>;
}

export interface CheckoutResult {
  stay: HotelStay;
  downpaymentAmount: number;
  extensionFee: number | null;
  remainingBalance: number;
}

export interface HotelStayWithCage extends HotelStay {
  cage_label: string;
}
