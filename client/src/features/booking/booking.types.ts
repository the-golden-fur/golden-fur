/**
 * Client-side mirror of server/src/features/booking/booking.types.ts. M03
 * Booking lives in its own feature folder, kept separate from
 * features/maintenance/ (M13) and features/discounts/ (M12) even though it
 * reads their data, same "one feature folder per module" rule those two
 * followed (#55 Guide notes).
 */

export const BOOKING_POLICY_WRITE_ROLES: readonly string[] = [
  'Admin',
  'Superadmin',
];

export type ServiceCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
];

/**
 * Unified booking lifecycle (booking-status revision): no manual "staff
 * confirms a booking" step ever existed - status was always set
 * automatically - so 'Confirmed' was retired rather than relabeled.
 * Pending (booked, appointment hasn't started) -> In Progress (a Start
 * action, or physical check-in for Hotel/Daycare) -> Completed (a Complete
 * action or checkout) -> Paid (automatic on Complete for an
 * already-confirmed online payment, otherwise a manual Mark as Paid
 * action). No-show is a lazy, read-time server transition: any Pending
 * booking whose scheduled_start has passed is flipped to No-show the next
 * time it's read. Cancelled is unchanged.
 */
export type BookingStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Paid'
  | 'Cancelled'
  | 'No-show';

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
  'Paid',
  'Cancelled',
  'No-show',
];

/** Holds a real capacity/staff-time slot - mirrors the server's
 * ACTIVE_BOOKING_STATUSES. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
  'Paid',
];

/** The service itself already happened, payment status aside. */
export const FINISHED_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Completed',
  'Paid',
];

export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
];

/** Only before the service has started - a booking whose scheduled_start
 * has already passed is separately blocked even while still Pending (see
 * ReceptionistBookingsQueuePage/CustomerBookingsPage's own time check). */
export const RESCHEDULABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
];

/** STUB vocabulary mirroring M08's future payment_method enum (Sprint 5). */
export const PAYMENT_METHODS = [
  'Cash',
  'GCash',
  'Maya',
  'Card',
  'Bank Transfer',
  'Grabmart',
  'Pickaroo',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Payment methods collected online, ahead of arrival - the rest are
 * pay-at-counter (#58 dev notes). */
export const ONLINE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'GCash',
  'Maya',
];

export type EnforcementMode = 'Strict' | 'Soft';

export type StaffPreferenceType = 'no_preference' | 'specific';

/**
 * Freetext preferences captured at booking time for a Hotel booking, so the
 * check-in form (HotelCheckInPage's structured, staff-only, billable care
 * instructions) can be pre-filled instead of starting blank. Not the
 * authoritative care record - the receptionist still confirms/edits
 * everything at physical check-in.
 */
export interface HotelBookingPreferenceFeeding {
  meal_time: 'Morning' | 'Afternoon' | 'Evening';
  food_type: string;
  quantity: string;
  special_instructions?: string;
}

export interface HotelBookingPreferenceWalking {
  time_block: string;
  duration_minutes: number;
  notes?: string;
}

export interface HotelBookingPreferenceMedication {
  medication_name: string;
  dose: string;
  scheduled_times: string[];
  administration_notes?: string;
}

export interface HotelBookingPreferences {
  feeding: HotelBookingPreferenceFeeding[];
  walking: HotelBookingPreferenceWalking[];
  medications: HotelBookingPreferenceMedication[];
}

export interface Booking {
  id: string;
  customer_id: string;
  pet_id: string;
  branch_id: string;
  created_by_staff_id: string | null;
  service_category: ServiceCategory;
  service_id: string | null;
  package_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  assigned_staff_id: string | null;
  status: BookingStatus;
  total_price: number;
  downpayment_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_confirmed: boolean;
  special_instructions: string | null;
  hotel_preferences: HotelBookingPreferences | null;
  started_at: string | null;
  completed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
  booking_addons?: BookingAddon[];
  staff_picker_preferences?: StaffPickerPreference[];
}

export interface BookingAddon {
  id: string;
  booking_id: string;
  service_id: string;
  price_at_booking: number;
}

export interface StaffPickerPreference {
  id: string;
  booking_id: string;
  preference_type: StaffPreferenceType;
  preferred_staff_id: string | null;
  staff_picker_shown: boolean;
}

/** Row shape of the #49 get_staff_availability() RPC result. */
export interface AvailableStaff {
  staff_id: string;
  display_name: string;
  profile_photo_url: string | null;
}

export type StaffPickerOption =
  | { type: 'no_preference' }
  | {
      type: 'specific';
      staff_id: string;
      display_name: string;
      profile_photo_url: string | null;
    };

export interface StaffPickerOptionsResult {
  staff_picker_enabled: boolean;
  options: StaffPickerOption[];
}

export interface PolicyConfiguration {
  id: string;
  branch_id: string | null;
  notice_period_days: number;
  notice_enforcement_mode: EnforcementMode;
  notice_enforcement_enabled: boolean;
  staff_picker_enabled_grooming: boolean;
  staff_picker_enabled_veterinary: boolean;
  created_at: string;
  updated_at: string;
}

export type EffectivePolicy = Pick<
  PolicyConfiguration,
  | 'notice_period_days'
  | 'notice_enforcement_mode'
  | 'notice_enforcement_enabled'
  | 'staff_picker_enabled_grooming'
  | 'staff_picker_enabled_veterinary'
>;

export interface StaffPreferenceInput {
  type: StaffPreferenceType;
  staff_id?: string;
}

export interface CreateBookingPayload {
  customer_id?: string;
  pet_id: string;
  branch_id: string;
  service_category: ServiceCategory;
  service_id?: string;
  package_id?: string;
  scheduled_start: string;
  scheduled_end: string;
  addon_service_ids?: string[];
  staff_preference?: StaffPreferenceInput;
  payment_method?: PaymentMethod;
  payment_confirmed?: boolean;
  special_instructions?: string;
  hotel_preferences?: HotelBookingPreferences;
}

export interface RescheduleBookingPayload {
  scheduled_start: string;
  scheduled_end: string;
  branch_id?: string;
  staff_preference?: StaffPreferenceInput;
}

export interface CancelBookingPayload {
  cancellation_reason?: string;
}

export interface RescheduleResult {
  booking: Booking;
  policy_violation: boolean;
  notice_period_met: boolean;
}

export interface CancellationResult {
  booking: Booking;
  notice_period_met: boolean;
  policy_violation: boolean;
}

/** #56/#60 supporting infra - server/src/features/booking/services/availability.service.ts. */
export type SlotLevel = 'available' | 'partial' | 'full';

export interface SlotAvailability {
  start: string;
  end: string;
  available: boolean;
  level: SlotLevel;
  eligible_staff_count?: number;
  /** Hotel only - how many petWeightClass-size cages remain free/total. */
  cage_capacity_remaining?: number;
  cage_capacity_total?: number;
}

export interface ListBookingsFilters {
  branchId?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** Inclusive date-range bounds (YYYY-MM-DD) - ignored when `date` is also
   * given. */
  dateFrom?: string;
  dateTo?: string;
  serviceCategory?: ServiceCategory;
  status?: BookingStatus;
}
