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
 * only ever handle payment collection (recording a payment on the
 * Transactions page), never the service lifecycle itself. */
export const BOOKING_STATUS_ADVANCE_ROLES: readonly string[] =
  BOOKING_POLICY_READ_ROLES.filter((role) => role !== 'Cashier');

/** Money-handling roles only - excludes Groomer/Veterinarian/Pet Assistant,
 * who advance Start/Complete but never touch payment. Gates the recording of
 * a transaction payment and the booking-time Cash discount picker
 * (resolveDiscountAndPromo). */
export const BOOKING_MARK_PAID_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
];

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
 * is tracked exclusively via payment_status now. */
export const OVERRIDABLE_BOOKING_STATUSES = [
  'Pending',
  'In Progress',
  'Completed',
] as const;

/** Assessment (renamed from Misc): administrative bookings (Initial
 * Assessment/Reassessment) with no staff-assignment or capacity contention -
 * falls through both checks in booking.service.ts automatically since
 * neither is keyed on this value. */
export type ServiceCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Assessment';

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
 * now tracked exclusively via the independent `payment_status` column/enum
 * (Pending -> Partially Paid -> Fully Paid, see PaymentStatus below) - a
 * booking's service-lifecycle status and its payment status move independently.
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
 * ...083). NOTE: down-payment slot gate (20260829146-148) adds a second
 * condition on top of this status list - a booking only actually holds its
 * slot when it ALSO passes SLOT_HOLD_PAID_OR_FILTER below. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
];

/**
 * PostgREST `.or()` string for "this booking isn't a down-payment-required
 * booking still sitting fully unpaid" - i.e. `NOT (downpayment_required AND
 * payment_status = 'Pending')`. A booking that fails this does NOT hold its
 * capacity/staff-time slot (down-payment slot gate: advisor addendum A3 -
 * an unpaid down payment must not lock the schedule). Applied alongside
 * `.in('status', ACTIVE_BOOKING_STATUSES)` in capacity.service.ts and
 * mirrored in get_staff_availability()'s Check 2 and the
 * grooming/consultation queue vivification filters.
 */
export const SLOT_HOLD_PAID_OR_FILTER =
  'downpayment_required.eq.false,payment_status.neq.Pending';

/**
 * `bookings.cancellation_reason` written by applyDownpaymentExpiry when an
 * unpaid down-payment-required Online booking is swept past its
 * `downpayment_due_at`. Exported so the receptionist queue can tell a real
 * cancellation apart from an expired pencil booking (it shows the latter as
 * "Expired" rather than "Cancelled") without re-hardcoding the string.
 */
export const DOWNPAYMENT_EXPIRED_CANCELLATION_REASON =
  'Down payment not received before the reservation deadline';

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
 * Independent of `status` above - tracks only how much of the booking's
 * charges have been collected, not the service lifecycle (a booking can be
 * 'Partially Paid' while `status` is still 'Pending', or 'Pending' while
 * `status` is 'Completed'). It is a **rollup of the booking's `transactions`
 * rows** - recomputed by the `settle_transaction` RPC (and the app-side
 * `recomputeBookingPaymentStatus`) after every payment: 'Pending' = nothing
 * settled, 'Partially Paid' = some settled but below the net total, 'Fully
 * Paid' = settled >= net total. Same vocabulary as `transactions.payment_status`
 * on purpose - there is no separate booking-level payment enum.
 */
export type PaymentStatus = 'Pending' | 'Partially Paid' | 'Fully Paid';

/** Walk-in booking flow (20260828145 migration): distinguishes a normal
 * future/same-day booking ('Online', default - customer self-booked, or
 * staff booking on someone's behalf for later) from a receptionist
 * registering a customer/pet physically present at the branch right now
 * ('Walk-in'). Drives two things in createBooking: 'Walk-in' skips
 * resolveDownpaymentPolicy entirely (no slot-holding risk - they're already
 * here) and starts at status 'In Progress' instead of 'Pending'. See
 * .agent skill capacity-based-scheduling.md / the walk-in-booking-flow
 * decision doc for full context. */
export type BookingSource = 'Online' | 'Walk-in';

export const BOOKING_SOURCES: readonly BookingSource[] = ['Online', 'Walk-in'];

/** The payment scheme a booking is created under. 'downpayment' (only when the
 * branch down-payment policy is on) charges just the down payment up front and
 * creates a separate 'balance' transaction for the rest; 'full' charges the
 * whole net total as one transaction. */
export const PAYMENT_SCHEMES = ['downpayment', 'full'] as const;
export type PaymentScheme = (typeof PAYMENT_SCHEMES)[number];

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'Pending',
  'Partially Paid',
  'Fully Paid',
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

/** The one genuinely new enum this epic introduces (#88) - enforcement_mode
 * already existed (Sprint 2 #52) and is reused as-is. */
export type RescheduleFeeType = 'Flat' | 'Percentage';

/** Same 'Flat'|'Percentage' vocabulary as RescheduleFeeType - kept as a
 * separate alias since it applies to a different column/concept
 * (policy_configurations.downpayment_type). */
export type DownpaymentType = 'Flat' | 'Percentage';

/** How account credit issued at a branch expires (20260902159):
 * 'none' never, 'rolling' credit_expiry_days after issuance,
 * 'fixed_date' all on credit_expiry_fixed_date. Mutually exclusive -
 * replaces the old credit_expiry_enabled boolean. */
export type CreditExpiryMode = 'none' | 'rolling' | 'fixed_date';

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
  /** Walk-in booking flow - see BookingSource's own dev note. Defaults to
   * 'Online' at the DB level (20260828145 migration); every booking created
   * before this feature backfills to 'Online'. */
  booking_source: BookingSource;
  scheduled_start: string;
  scheduled_end: string;
  assigned_staff_id: string | null;
  status: BookingStatus;
  /** Rollup of the booking's transactions - see PaymentStatus above. */
  payment_status: PaymentStatus;
  total_price: number;
  downpayment_amount: number | null;
  /** True when the effective policy_configurations downpayment config was
   * enabled at creation time (see resolveDownpaymentPolicy in
   * staffPicker.service.ts). Drives queue gating (grooming/consultation/
   * listBookings) - see 20260808111's original dev notes (mechanism since
   * moved from per-catalog-item to per-transaction by 20260828143/144). */
  downpayment_required: boolean;
  /** Down-payment slot gate (20260829147): when an unpaid, down-payment-
   * required Online booking auto-cancels if still unpaid. NULL for walk-ins,
   * already-paid bookings, and bookings with no down-payment requirement.
   * Snapshotted from the effective policy's downpayment_hold_hours at
   * creation; enforced by applyDownpaymentExpiry (lazy, read-time). */
  downpayment_due_at: string | null;
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
  /** Custom change: Cage Picker addendum - a Hotel booking's soft, booking-
   * time cage preference. Never a hard claim on its own; check-in's existing
   * suggestCage/assignCage flow (hotel/services/cageAssignment.service.ts)
   * still performs the real, concurrency-safe reservation, using this only
   * to pre-select what the customer already asked for. NULL = no
   * preference. */
  preferred_cage_id: string | null;
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
  /** Reschedule/cancellation notice, in whole days - see evaluateNoticePeriod
   * (reschedule.service.ts) and cancellation.service.ts. NOT a new-booking
   * floor; that is booking_notice_period_days. Default 3. */
  notice_period_days: number;
  notice_enforcement_mode: EnforcementMode;
  notice_enforcement_enabled: boolean;
  /** Minimum whole days ahead of "now" (branch tz) that a NEW online booking
   * must be scheduled. 0 = same-day allowed (default). Independent of
   * notice_period_days. Read by bookingLeadDays/assertMeetsBookingLeadTime in
   * staffPicker.service.ts. */
  booking_notice_period_days: number;
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
  credit_expiry_mode: CreditExpiryMode;
  credit_expiry_days: number;
  /** The calendar date ("YYYY-MM-DD") every not-yet-expired credit lot at
   * this branch expires on, when credit_expiry_mode = 'fixed_date'. NULL
   * otherwise. */
  credit_expiry_fixed_date: string | null;
  /** Percentage (0-100) of the amount a customer actually paid that is
   * converted to account credit on a qualifying cancellation (advisor
   * addendum #10). Default 100 = full conversion; lower it to keep part of
   * the payment as a cancellation charge. Applied in cancellation.service.ts. */
  cancellation_credit_conversion_rate: number;
  /** Master toggle for the customer-facing PayMongo "Pay" button - when
   * false, the button still renders (disabled, with an explanatory
   * tooltip) rather than disappearing. See isOnlinePaymentsEnabled in
   * staffPicker.service.ts. */
  online_payments_enabled: boolean;
  /** Per-transaction downpayment config, applied against a booking's whole
   * total_price at creation time - see resolveDownpaymentPolicy in
   * staffPicker.service.ts and createBooking in booking.service.ts.
   * Supersedes the old per-catalog-item services/packages.
   * requires_downpayment mechanism (removed by 20260828144). */
  downpayment_enabled: boolean;
  /** Populated only when downpayment_enabled is true. */
  downpayment_type: DownpaymentType | null;
  downpayment_amount: number | null;
  /** Down-payment slot gate (20260829146): hours from creation before an
   * unpaid down-payment-required Online booking auto-cancels. NOT NULL,
   * default 24. Snapshotted onto bookings.downpayment_due_at at creation. */
  downpayment_hold_hours: number;
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
  | 'booking_notice_period_days'
  | 'staff_picker_enabled_grooming'
  | 'staff_picker_enabled_veterinary'
  | 'lunch_break_enabled'
  | 'lunch_break_start'
  | 'lunch_break_end'
  | 'reschedule_fee_enabled'
  | 'reschedule_fee_type'
  | 'reschedule_fee_value'
  | 'reschedule_free_allowance'
  | 'credit_expiry_mode'
  | 'credit_expiry_days'
  | 'credit_expiry_fixed_date'
  | 'cancellation_credit_conversion_rate'
  | 'online_payments_enabled'
  | 'downpayment_enabled'
  | 'downpayment_type'
  | 'downpayment_amount'
  | 'downpayment_hold_hours'
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

/** Custom change: Cage Picker addendum - mirrors StaffPickerOption's shape.
 * Only meaningful for Hotel bookings whose service type has
 * cage_picker_enabled set (service_types table) - see cagePicker.service.ts. */
export type CagePickerOption =
  | { type: 'no_preference' }
  | {
      type: 'specific';
      cage_id: string;
      cage_label: string;
      size: string;
    };
