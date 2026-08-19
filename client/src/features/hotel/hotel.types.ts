export type CageSize = 'S' | 'M' | 'L' | 'XL';
export type CageStatus =
  | 'Available'
  | 'Occupied'
  | 'Reserved'
  | 'Under Maintenance';
export type MealTime = 'Morning' | 'Noon' | 'Afternoon' | 'Evening';
export type PartOfDay = 'Morning' | 'Afternoon' | 'Evening';
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

/** Custom change (Daycare/Hotel parity): the server's `stays` table
 * (renamed from hotel_stays) now also backs Daycare check-ins - see
 * daycare.types.ts's DaycareSession, a type alias of this same shape. */
export interface HotelStay {
  id: string;
  stay_type: StayType;
  booking_id: string | null;
  pet_id: string;
  branch_id: string;
  cage_id: string;
  status: StayStatus;
  check_in_at: string | null;
  scheduled_check_out_date: string | null;
  actual_check_out_at: string | null;
  downpayment_amount: number | null;
  extension_fee: number | null;
  computed_charge: number | null;
  /** Custom change (Daycare fee configuration): the service this stay's
   * fee schedule comes from - Daycare-only in practice today. */
  service_id: string | null;
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

/** Custom change (Boarding Checklist Kanban): Pending -> In Progress ->
 * Completed - the Kanban board's column axis. Missed and Backlog are both
 * server-computed, read-time relabelings, never set directly by the client -
 * Missed for a Pending/In Progress entry whose scheduled_date has passed,
 * Backlog for a Pending entry whose scheduled_date hasn't arrived yet
 * (unlike Missed, never persisted - it self-resolves once the date arrives). */
export type CareLogEntryStatus =
  | 'Backlog'
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Missed';

export interface CareLogEntry {
  id: string;
  stay_id: string;
  care_type: 'Feeding' | 'Walking' | 'Medication' | 'Playing';
  scheduled_date: string;
  description: string;
  /** Morning/Noon/Afternoon/Evening - the Kanban board's most important
   * group-by. Null only for a handful of legacy rows or an
   * "as scheduled" medication with no real time to bucket. */
  time_block: MealTime | null;
  status: CareLogEntryStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  completed_by_staff?: { display_name: string } | null;
  /** Only populated by getCareLogEntries's join - which pet/stay type
   * this task belongs to, for the Hotel/Daycare subtabs and pet name
   * display. */
  stays?: { stay_type: 'Hotel' | 'Daycare'; pet_id: string } | null;
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

/** Custom change: Hotel/Daycare activity logbook (#48 follow-up). */
export type ActivityLogAction =
  | 'check_in'
  | 'check_out'
  | 'task_started'
  | 'task_completed'
  | 'task_reopened'
  | 'task_missed';

export interface ActivityLogEntry {
  id: string;
  branch_id: string;
  stay_id: string | null;
  care_log_entry_id: string | null;
  action: ActivityLogAction;
  actor_staff_id: string | null;
  description: string;
  created_at: string;
  /** Null for a system-driven entry (the lazy Missed transition - nobody
   * clicked anything). */
  actor_staff?: { display_name: string } | null;
}
