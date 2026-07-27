export type CageSize = 'S' | 'M' | 'L' | 'XL';
export type CageStatus =
  | 'Available'
  | 'Occupied'
  | 'Reserved'
  | 'Under Maintenance';
export type HotelStayStatus = 'Active' | 'Completed';
export type MealTime = 'Morning' | 'Afternoon' | 'Evening';

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
  status: HotelStayStatus;
  check_in_at: string | null;
  scheduled_check_out_date: string;
  actual_check_out_at: string | null;
  downpayment_amount: number;
  extension_fee: number | null;
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

export interface FeedingInstructionPayload {
  meal_time: MealTime;
  food_type: string;
  quantity: string;
  special_instructions?: string;
  food_catalog_id?: string;
  brought_by_customer?: boolean;
}

export interface WalkingInstructionPayload {
  time_block: string;
  duration_minutes: number;
  notes?: string;
}

export interface MedicationInstructionPayload {
  medication_name: string;
  dose: string;
  scheduled_times: string[];
  administration_notes?: string;
  medication_catalog_id?: string;
  brought_by_customer?: boolean;
}

export interface CareLogEntry {
  id: string;
  hotel_stay_id: string;
  care_type: 'Feeding' | 'Walking' | 'Medication';
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
  medications?: MedicationInstructionPayload[];
  notify_opt_in: boolean;
}

export interface CheckInResult {
  stay: HotelStay;
  feeding: FeedingInstructionPayload[];
  walking: WalkingInstructionPayload[];
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
  suppliedItemsCharge: number | null;
  remainingBalance: number;
}

export interface CreateCatalogItemPayload {
  name: string;
  price: number;
}

export interface UpdateCatalogItemPayload {
  name?: string;
  price?: number;
  is_active?: boolean;
}

export interface HotelStayWithCage extends HotelStay {
  cage_label: string;
}
