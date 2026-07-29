/**
 * Feature-local role lists (mirrors maintenance.types.ts). Booking creation /
 * reschedule / cancellation are open to customers AND staff, so those routes
 * gate with jwtMiddleware only and authorize ownership at the service layer;
 * these lists cover the staff-only policy-configuration surface (#52).
 */
export const BOOKING_POLICY_READ_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

export const BOOKING_POLICY_WRITE_ROLES: readonly string[] = [
  'Admin',
  'Superadmin',
];

/** Start/Complete: any staff role - whoever is physically doing the work
 * (Groomer, Veterinarian, Receptionist checking a pet in, etc.) should be
 * able to advance a booking regardless of category, mirroring
 * BOOKING_POLICY_READ_ROLES' "all staff" set. */
export const BOOKING_STATUS_ADVANCE_ROLES: readonly string[] =
  BOOKING_POLICY_READ_ROLES;

/** Mark as Paid: money-handling roles only - excludes Groomer/Veterinarian/
 * Pet Assistant, who advance Start/Complete but never touch payment. */
export const BOOKING_MARK_PAID_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
];

export type ServiceCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

/**
 * Unified booking lifecycle (booking-status revision): no manual "staff
 * confirms a booking" step ever existed - status was always set
 * automatically - so 'Confirmed' was retired rather than relabeled.
 * Pending (booked, appointment hasn't started) -> In Progress (Start
 * action, or physical check-in for Hotel/Daycare) -> Completed (Complete
 * action or checkout) -> Paid (automatic on Complete for an
 * already-confirmed online payment, otherwise a manual Mark as Paid
 * action). No-show is a lazy, read-time transition applied by
 * applyNoShowTransition in booking.service.ts (no cron infra exists in this
 * app): any Pending booking whose scheduled_start has passed is flipped to
 * No-show the next time it's read. Cancelled is unchanged.
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

/** Holds a real capacity/staff-time slot - mirrors the
 * bookings_staff_active_idx partial index predicate and
 * get_staff_availability()'s Check 2 (migrations 20260728058/...062). */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
  'Paid',
];

/** The service itself already happened, payment status aside - used by
 * currentPrescription.service.ts and similar "did this actually occur"
 * reads that used to filter a per-module status = 'Completed'. */
export const FINISHED_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Completed',
  'Paid',
];

export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
];

/** Only before the service has started - matches "shouldn't be able to
 * reschedule a booking that's already underway or past due" (past-due is
 * additionally enforced by scheduled_start, not just status, in
 * reschedule.service.ts). */
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

/** Collected online, ahead of arrival - drives completeBooking's automatic
 * Completed->Paid fast path (booking-status revision). The rest are
 * pay-at-counter, requiring a manual Mark as Paid action. */
export const ONLINE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'GCash',
  'Maya',
];

export type EnforcementMode = 'Strict' | 'Soft';

export type StaffPreferenceType = 'no_preference' | 'specific';

/**
 * Freetext preferences captured at booking time for a Hotel booking, so the
 * check-in form (M05's structured, staff-only, billable care instructions -
 * see hotel.types.ts) can be pre-filled instead of starting blank. Not the
 * authoritative care record - the receptionist still confirms/edits
 * everything at physical check-in.
 */
export interface HotelBookingPreferenceFeeding {
  meal_time: 'Morning' | 'Afternoon' | 'Evening';
  food_type: string;
  quantity: string;
  special_instructions?: string;
  food_catalog_id?: string;
  brought_by_customer?: boolean;
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
  medication_catalog_id?: string;
  brought_by_customer?: boolean;
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

/**
 * The effective policy for a branch: the branch-specific row's values where
 * one exists, otherwise the seeded system-wide default row's.
 */
export type EffectivePolicy = Pick<
  PolicyConfiguration,
  | 'notice_period_days'
  | 'notice_enforcement_mode'
  | 'notice_enforcement_enabled'
  | 'staff_picker_enabled_grooming'
  | 'staff_picker_enabled_veterinary'
>;

export type StaffPickerOption =
  | { type: 'no_preference' }
  | {
      type: 'specific';
      staff_id: string;
      display_name: string;
      profile_photo_url: string | null;
    };
