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

export type BookingStatus =
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled'
  | 'No-show'
  | 'Pending';

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
}

export interface ListBookingsFilters {
  branchId?: string;
  /** YYYY-MM-DD */
  date?: string;
  serviceCategory?: ServiceCategory;
  status?: BookingStatus;
}
