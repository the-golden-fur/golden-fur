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

export type ServiceCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

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
