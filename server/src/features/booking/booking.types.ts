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

/** Start/Complete: any staff role EXCEPT Cashier - whoever is physically
 * doing the work (Groomer, Veterinarian, Receptionist checking a pet in,
 * etc.) should be able to advance a booking regardless of category, mirroring
 * BOOKING_POLICY_READ_ROLES' "all staff" set. Cashier is carved out: they
 * only ever handle payment collection (the payment_stage "Mark as Paid"
 * action - see PAYMENT_STAGE_ADVANCE_ROLES), never the service lifecycle
 * itself. */
export const BOOKING_STATUS_ADVANCE_ROLES: readonly string[] =
  BOOKING_POLICY_READ_ROLES.filter((role) => role !== 'Cashier');

/** Money-handling roles only - excludes Groomer/Veterinarian/Pet Assistant,
 * who advance Start/Complete but never touch payment. Gates both the
 * payment_stage "Mark as Paid" action (PAYMENT_STAGE_ADVANCE_ROLES) and the
 * booking-time Cash discount picker (resolveDiscountAndPromo). */
export const BOOKING_MARK_PAID_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
];

/** payment_stage "Mark as Paid" action: same money-handling roles as
 * BOOKING_MARK_PAID_ROLES - cashiers are the primary user, but
 * Receptionist/Admin/Supervisor also collect payment at the front desk. */
export const PAYMENT_STAGE_ADVANCE_ROLES: readonly string[] =
  BOOKING_MARK_PAID_ROLES;

/** Direct status override (forward OR backward) - Admin/Superadmin only,
 * replacing their Start/Complete buttons with a single status dropdown in
 * the queue. Everyone else keeps the one-directional Start/Complete
 * actions above. */
export const BOOKING_STATUS_OVERRIDE_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
];

/** The statuses reachable from the override dropdown - excludes
 * Cancelled/No-show, which keep their own dedicated flows (a cancellation
 * reason, the lazy no-show transition) rather than becoming a bare status
 * flip. 'Paid' was retired from BookingStatus entirely (see below) - payment
 * is tracked exclusively via payment_stage now. */
export const OVERRIDABLE_BOOKING_STATUSES = [
  'Pending',
  'In Progress',
  'Completed',
] as const;

/** Misc: administrative bookings (Initial Assessment/Reassessment) with no
 * staff-assignment or capacity contention - falls through both checks in
 * booking.service.ts automatically since neither is keyed on this value. */
export type ServiceCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Misc';

/**
 * Unified booking lifecycle (booking-status revision): no manual "staff
 * confirms a booking" step ever existed - status was always set
 * automatically - so 'Confirmed' was retired rather than relabeled.
 * Pending (booked, appointment hasn't started) -> In Progress (Start
 * action, or physical check-in for Hotel/Daycare) -> Completed (Complete
 * action or checkout). No-show is a lazy, read-time transition applied by
 * applyNoShowTransition in booking.service.ts (no cron infra exists in this
 * app): any Pending booking whose scheduled_start has passed is flipped to
 * No-show the next time it's read. Cancelled is unchanged.
 *
 * 'Paid' was retired as a status value (staff-queue-overhaul): payment is
 * now tracked exclusively via the independent `payment_stage` column/enum
 * (Unpaid -> Paid in Advance -> Paid, see PaymentStage below) - a booking's
 * service-lifecycle status and its payment status move independently.
 */
export type BookingStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled'
  | 'No-show';

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
  'Cancelled',
  'No-show',
];

/** Holds a real capacity/staff-time slot - mirrors the
 * bookings_staff_active_idx partial index predicate and
 * get_staff_availability()'s Check 2 (migrations 20260728058/...062/
 * ...083). */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
];

/** The service itself already happened, payment status aside - used by
 * currentPrescription.service.ts and similar "did this actually occur"
 * reads that used to filter a per-module status = 'Completed'. */
export const FINISHED_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Completed',
];

export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
];

/**
 * Independent of `status` above - tracks only when money changed hands, not
 * the service lifecycle (a booking can be 'Paid in Advance' while `status`
 * is still 'Pending', or 'Unpaid' while `status` is 'Completed'). A cashier
 * (or other money-handling staff) manually advances this via the "Mark as
 * Paid" button on the queue: from Unpaid it moves to 'Paid in Advance'
 * (money collected before the service happens) or straight to 'Paid' (a
 * normal onsite payment, collected once in full); from 'Paid in Advance' it
 * always moves straight to 'Paid' once the balance is later settled. Only
 * Admin/Superadmin can revert it, mirroring OVERRIDABLE_BOOKING_STATUSES.
 * This is the sole "payment complete" signal on `bookings` now that
 * `status` can no longer reach 'Paid' - separate still from Cashier
 * Checkout's own `transactions` table, which this does not replace.
 */
export type PaymentStage = 'Unpaid' | 'Paid in Advance' | 'Paid';

export const PAYMENT_STAGES: readonly PaymentStage[] = [
  'Unpaid',
  'Paid in Advance',
  'Paid',
];

export const OVERRIDABLE_PAYMENT_STAGES = [
  'Unpaid',
  'Paid in Advance',
  'Paid',
] as const;

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

/** The one genuinely new enum this epic introduces (#88) - enforcement_mode
 * already existed (Sprint 2 #52) and is reused as-is. */
export type RescheduleFeeType = 'Flat' | 'Percentage';

export type StaffPreferenceType = 'no_preference' | 'specific';

/**
 * Freetext preferences captured at booking time for a Hotel OR Daycare
 * booking (Custom change: Daycare/Hotel parity follow-up - "make daycare
 * the same as hotel" extends to this step too), so the check-in form (M05's
 * structured, staff-only, billable care instructions - see hotel.types.ts)
 * can be pre-filled instead of starting blank. Not the authoritative care
 * record - the receptionist still confirms/edits everything at physical
 * check-in. Named/typed Hotel-specific (also the `bookings.hotel_preferences`
 * column) since Hotel had it first - reused as-is for Daycare rather than
 * adding a parallel `daycare_preferences` field, since the shape is
 * identical and category-agnostic.
 */
/** null/undefined stay_date = applies to every night of the stay (the "same
 * instructions every night" default); a specific date scopes the row to
 * that single night only (#22 per-night care instructions). */
export interface HotelBookingPreferenceFeeding {
  meal_time: 'Morning' | 'Noon' | 'Afternoon' | 'Evening';
  food_type: string;
  quantity: string;
  special_instructions?: string;
  food_catalog_id?: string;
  stay_date?: string;
}

export interface HotelBookingPreferenceWalking {
  time_block: 'Morning' | 'Afternoon' | 'Evening';
  duration_minutes: number;
  notes?: string;
  stay_date?: string;
}

export interface HotelBookingPreferencePlaying {
  time_block: 'Morning' | 'Afternoon' | 'Evening';
  duration_minutes: number;
  notes?: string;
  stay_date?: string;
}

export interface HotelBookingPreferenceMedication {
  medication_name: string;
  dose: string;
  scheduled_times: string[];
  administration_notes?: string;
  medication_catalog_id?: string;
  stay_date?: string;
}

export interface HotelBookingPreferences {
  /** Whether the customer/receptionist opted into per-night editing.
   * Purely informational for reconstructing the booking-flow UI - the
   * authoritative per-row scoping is each row's own stay_date. */
  uniform_instructions: boolean;
  feeding: HotelBookingPreferenceFeeding[];
  walking: HotelBookingPreferenceWalking[];
  playing: HotelBookingPreferencePlaying[];
  medications: HotelBookingPreferenceMedication[];
}

export interface Booking {
  id: string;
  customer_id: string;
  pet_id: string;
  branch_id: string;
  created_by_staff_id: string | null;
  service_category: ServiceCategory;
  scheduled_start: string;
  scheduled_end: string;
  assigned_staff_id: string | null;
  status: BookingStatus;
  payment_stage: PaymentStage;
  total_price: number;
  downpayment_amount: number | null;
  /** True when at least one selected service/package was flagged
   * requires_downpayment at creation. Drives queue gating (grooming/
   * consultation/listBookings) - see 20260808111's dev notes. */
  downpayment_required: boolean;
  payment_method: PaymentMethod | null;
  payment_confirmed: boolean;
  /** Selected at booking creation (staff-only, Cash-only) rather than
   * auto-evaluated at checkout - see resolveDiscountAndPromo in
   * booking.service.ts. discount_amount/promo_amount are 0 when unset. */
  selected_discount_id: string | null;
  selected_promo_id: string | null;
  discount_amount: number;
  promo_amount: number;
  special_instructions: string | null;
  hotel_preferences: HotelBookingPreferences | null;
  started_at: string | null;
  completed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  reschedule_count: number;
  /** Written by rescheduleFee.service.ts (#92) at reschedule confirmation;
   * read and cleared to NULL by Epic A's checkoutAggregation.service.ts once
   * posted as a transaction_line_items row (that read side is Epic A
   * follow-up work, not built by this epic). */
  pending_reschedule_fee_amount: number | null;
  created_at: string;
  updated_at: string;
  booking_items?: BookingItem[];
  staff_picker_preferences?: StaffPickerPreference[];
}

export interface BookingItem {
  id: string;
  booking_id: string;
  service_id: string | null;
  package_id: string | null;
  price_at_booking: number;
  duration_minutes_at_booking: number;
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
  /** Fixed daily lunch break - no bookings/staff availability during this
   * window, "HH:MM:SS" (Postgres `time`). Default 12:00-13:00. */
  lunch_break_enabled: boolean;
  lunch_break_start: string;
  lunch_break_end: string;
  reschedule_fee_enabled: boolean;
  /** Populated only when reschedule_fee_enabled is true. */
  reschedule_fee_type: RescheduleFeeType | null;
  reschedule_fee_value: number | null;
  /** NULL = unlimited free reschedules (documented default). */
  reschedule_free_allowance: number | null;
  credit_expiry_enabled: boolean;
  credit_expiry_days: number;
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
  | 'lunch_break_enabled'
  | 'lunch_break_start'
  | 'lunch_break_end'
  | 'reschedule_fee_enabled'
  | 'reschedule_fee_type'
  | 'reschedule_fee_value'
  | 'reschedule_free_allowance'
  | 'credit_expiry_enabled'
  | 'credit_expiry_days'
>;

/** event_type is plain text, not an enum, matching transaction_line_items'
 * line_item_type convention (#89). Documented values: 'cancellation',
 * 'reschedule'. */
export type CancellationLogEventType = 'cancellation' | 'reschedule';

export interface CancellationLog {
  id: string;
  booking_id: string;
  customer_id: string;
  branch_id: string;
  event_type: CancellationLogEventType;
  notice_period_met: boolean;
  enforcement_mode_applied: EnforcementMode;
  policy_violation: boolean;
  credit_issued: boolean;
  credit_amount: number | null;
  reschedule_fee_charged: number | null;
  notes: string | null;
  created_at: string;
}

export type StaffPickerOption =
  | { type: 'no_preference' }
  | {
      type: 'specific';
      staff_id: string;
      display_name: string;
      profile_photo_url: string | null;
    };
