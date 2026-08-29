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

/** Mirrors the server's BOOKING_MARK_PAID_ROLES - money-handling roles only.
 * Reused client-side to gate the booking wizard's discount picker (a
 * discount needs staff to have verified an ID onsite, same trust boundary
 * as Mark as Paid) and the payment_stage "Mark as Paid" button, separate
 * from promos which anyone can select. */
export const BOOKING_MARK_PAID_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
];

/** Mirrors the server's BOOKING_STATUS_OVERRIDE_ROLES - gates the queue's
 * status-override dropdown (replaces Start/Complete buttons with one
 * control that can also move a booking backward). */
export const BOOKING_STATUS_OVERRIDE_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
];

/** Mirrors the server's OVERRIDABLE_BOOKING_STATUSES - Cancelled/No-show
 * keep their own dedicated flows, not this dropdown. 'Paid' was retired
 * from BookingStatus entirely (see below). */
export const OVERRIDABLE_BOOKING_STATUSES = [
  'Pending',
  'In Progress',
  'Completed',
] as const;

/** Misc: administrative bookings (Initial Assessment/Reassessment) with no
 * staff-assignment or capacity contention. */
export type ServiceCategory =
  | 'Grooming'
  | 'Hotel'
  | 'Daycare'
  | 'Veterinary'
  | 'Misc';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
];

/**
 * Unified booking lifecycle (booking-status revision): no manual "staff
 * confirms a booking" step ever existed - status was always set
 * automatically - so 'Confirmed' was retired rather than relabeled.
 * Pending (booked, appointment hasn't started) -> In Progress (a Start
 * action, or physical check-in for Hotel/Daycare) -> Completed (a Complete
 * action or checkout). No-show is a lazy, read-time server transition: any
 * Pending booking whose scheduled_start has passed is flipped to No-show
 * the next time it's read. Cancelled is unchanged.
 *
 * 'Paid' was retired as a status value (staff-queue-overhaul): payment is
 * now tracked exclusively via the independent `payment_stage` field
 * (Unpaid -> Paid in Advance -> Paid, see PaymentStage below).
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

/** Holds a real capacity/staff-time slot - mirrors the server's
 * ACTIVE_BOOKING_STATUSES. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
];

/** The service itself already happened, payment status aside. */
export const FINISHED_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Completed',
];

export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
];

/**
 * Mirrors the server's PaymentStage - independent of BookingStatus above, it
 * tracks only when money changed hands, not the service lifecycle. This is
 * the sole "payment complete" signal on a booking now that `status` can no
 * longer reach 'Paid'. A cashier (or other money-handling staff) advances
 * this via the queue's "Mark as Paid" button: from Unpaid, either straight
 * to Paid (a normal onsite payment) or to Paid in Advance (money collected
 * before the service happens); from Paid in Advance, always straight to
 * Paid once the balance is settled. Only Admin/Superadmin can revert it,
 * via the same BOOKING_STATUS_OVERRIDE_ROLES dropdown pattern used for
 * BookingStatus.
 */
export type PaymentStage = 'Unpaid' | 'Paid in Advance' | 'Paid';

/** Walk-in booking flow: mirrors the server's BookingSource. 'Online'
 * (default) is today's only path for a customer booking from home, or a
 * receptionist booking a future/same-day appointment on someone's behalf -
 * unchanged, still goes through the down payment policy. 'Walk-in' is a new
 * receptionist-only path for a customer/pet physically at the branch right
 * now - skips the down payment policy and starts at status 'In Progress'
 * rather than 'Pending'. Only ever offered in CustomerBookingFlowPage's
 * receptionist mode - a remote customer booking from home never sees the
 * choice at all (always implicitly 'Online'). */
export type BookingSource = 'Online' | 'Walk-in';

export const BOOKING_SOURCES: readonly BookingSource[] = ['Online', 'Walk-in'];

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

/** Only before the service has started - a booking whose scheduled_start
 * has already passed is separately blocked even while still Pending (see
 * ReceptionistBookingsQueuePage/CustomerBookingsPage's own time check). */
export const RESCHEDULABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
];

/** Mirrors the server's ACTIVE_BOOKING_STATUSES (booking.types.ts) - a
 * Cancelled/No-show booking has nothing left to collect. */
export const PAYABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
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

/** The one genuinely new enum this epic introduces (#88) - enforcement_mode
 * already existed and is reused as-is. */
export type RescheduleFeeType = 'Flat' | 'Percentage';

/** Same 'Flat'|'Percentage' vocabulary as RescheduleFeeType, kept as a
 * separate alias since it applies to a different concept
 * (policy_configurations.downpayment_type). */
export type DownpaymentType = 'Flat' | 'Percentage';

export type StaffPreferenceType = 'no_preference' | 'specific';

/**
 * Freetext preferences captured at booking time for a Hotel booking, so the
 * check-in form (HotelCheckInPage's structured, staff-only, billable care
 * instructions) can be pre-filled instead of starting blank. Not the
 * authoritative care record - the receptionist still confirms/edits
 * everything at physical check-in.
 */
/** stay_date omitted = applies to every night of the stay (the "same
 * instructions every night" default); a specific date scopes the row to
 * that single night only (#22 per-night care instructions). */
export interface HotelBookingPreferenceFeeding {
  meal_time: 'Morning' | 'Noon' | 'Afternoon' | 'Evening';
  food_type: string;
  quantity: string;
  special_instructions?: string;
  /** Set only when food_type matched a food/medication catalog item - mirrors
   * hotel.types.ts's FeedingInstructionPayload naming so HotelCheckInPage's
   * prefill can pass these straight through at check-in. */
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
  /** Whether the customer/receptionist opted into per-night editing -
   * informational only, the authoritative scoping is each row's stay_date. */
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
   * 'Online' at the DB level; every booking created before this feature
   * backfills to 'Online'. */
  booking_source: BookingSource;
  scheduled_start: string;
  scheduled_end: string;
  assigned_staff_id: string | null;
  status: BookingStatus;
  payment_stage: PaymentStage;
  total_price: number;
  downpayment_amount: number | null;
  /** True when the effective policy_configurations downpayment config was
   * enabled at creation time - drives staff queue gating. */
  downpayment_required: boolean;
  /** Down-payment slot gate: when an unpaid, down-payment-required Online
   * booking auto-cancels if still unpaid (it holds no slot until it pays).
   * NULL for walk-ins, already-paid bookings, and bookings with no
   * down-payment requirement. */
  downpayment_due_at: string | null;
  payment_method: PaymentMethod | null;
  payment_confirmed: boolean;
  /** Selected at booking creation (staff-only, Cash-only for the discount)
   * rather than only auto-evaluated at checkout - see the booking payment
   * step's discount/promo picker. 0 when nothing was selected. */
  selected_discount_id: string | null;
  selected_promo_id: string | null;
  discount_amount: number;
  promo_amount: number;
  special_instructions: string | null;
  hotel_preferences: HotelBookingPreferences | null;
  /** Custom change: Cage Picker addendum - a Hotel booking's soft, booking-
   * time cage preference. NULL = no preference. The real cage claim still
   * only happens at check-in. */
  preferred_cage_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  reschedule_count: number;
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

/** Custom change: Cage Picker addendum - mirrors StaffPickerOption/
 * StaffPickerOptionsResult. Only offered for Hotel bookings whose service
 * type has cage_picker_enabled set (Admin Settings > Service Types). */
export type CagePickerOption =
  | { type: 'no_preference' }
  | {
      type: 'specific';
      cage_id: string;
      cage_label: string;
      size: string;
    };

export interface CagePickerOptionsResult {
  cage_picker_enabled: boolean;
  options: CagePickerOption[];
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
  /** Master toggle for the customer-facing PayMongo Pay button - when
   * false, the button still renders (disabled, with an explanatory
   * tooltip) rather than disappearing. */
  online_payments_enabled: boolean;
  /** Per-transaction downpayment config, applied against a booking's whole
   * total_price at creation time - see createBooking server-side.
   * Supersedes the old per-catalog-item Service/Package.
   * requires_downpayment mechanism. */
  downpayment_enabled: boolean;
  /** Populated only when downpayment_enabled is true. */
  downpayment_type: DownpaymentType | null;
  downpayment_amount: number | null;
  /** Down-payment slot gate: hours from creation before an unpaid
   * down-payment-required Online booking auto-cancels and its (unheld)
   * slot is released. NOT NULL, default 24. */
  downpayment_hold_hours: number;
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
  | 'lunch_break_enabled'
  | 'lunch_break_start'
  | 'lunch_break_end'
  | 'reschedule_fee_enabled'
  | 'reschedule_fee_type'
  | 'reschedule_fee_value'
  | 'reschedule_free_allowance'
  | 'credit_expiry_enabled'
  | 'credit_expiry_days'
  | 'online_payments_enabled'
  | 'downpayment_enabled'
  | 'downpayment_type'
  | 'downpayment_amount'
  | 'downpayment_hold_hours'
>;

export interface UpdatePolicyPayload {
  branch_id?: string | null;
  notice_period_days?: number;
  notice_enforcement_mode?: EnforcementMode;
  notice_enforcement_enabled?: boolean;
  staff_picker_enabled_grooming?: boolean;
  staff_picker_enabled_veterinary?: boolean;
  lunch_break_enabled?: boolean;
  lunch_break_start?: string;
  lunch_break_end?: string;
  reschedule_fee_enabled?: boolean;
  reschedule_fee_type?: RescheduleFeeType | null;
  reschedule_fee_value?: number | null;
  reschedule_free_allowance?: number | null;
  credit_expiry_enabled?: boolean;
  credit_expiry_days?: number;
  online_payments_enabled?: boolean;
  downpayment_enabled?: boolean;
  downpayment_type?: DownpaymentType | null;
  downpayment_amount?: number | null;
  downpayment_hold_hours?: number;
}

export interface StaffPreferenceInput {
  type: StaffPreferenceType;
  staff_id?: string;
}

/** Custom change: Cage Picker addendum - mirrors StaffPreferenceInput. */
export interface CagePreferenceInput {
  type: 'no_preference' | 'specific';
  cage_id?: string;
}

export type BookingItemInput = { service_id: string } | { package_id: string };

export interface CreateBookingPayload {
  customer_id?: string;
  pet_id: string;
  branch_id: string;
  service_category: ServiceCategory;
  /** Walk-in booking flow - omitted/'Online' behaves exactly like every
   * booking did before this field existed (the server defaults to 'Online'
   * either way). 'Walk-in' is staff-only, rejected server-side otherwise. */
  booking_source?: BookingSource;
  items: BookingItemInput[];
  scheduled_start: string;
  scheduled_end: string;
  staff_preference?: StaffPreferenceInput;
  cage_preference?: CagePreferenceInput;
  payment_method?: PaymentMethod;
  payment_confirmed?: boolean;
  /** Only meaningful when the selected items require a downpayment and
   * payment_confirmed is true (an online method) - lets the customer/
   * receptionist choose to pay just the downpayment now (payment_stage
   * becomes 'Paid in Advance', balance settled later at the counter) or the
   * full amount now (payment_stage becomes 'Paid'). Omitted/'full' behaves
   * like every booking did before this field existed. */
  payment_choice?: 'downpayment' | 'full';
  // Staff-only (money-handling roles), Cash-only - see booking.service.ts's
  // resolveDiscountAndPromo.
  discount_id?: string;
  // Open to customers too - no role or payment-method restriction.
  promo_id?: string;
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

/** Customer self-service Pay button (CustomerBookingsPage). */
export interface PayForBookingPayload {
  payment_method: 'GCash' | 'Maya';
  pay_in_full: boolean;
}

export interface PayForBookingResult {
  checkoutUrl: string;
}

/** Custom change: duplicate-booking prevention - a pet's earliest
 * unresolved (Pending/In Progress) booking, any category. Disables that
 * pet at the booking flow's pet-selection step and links to the existing
 * booking instead of letting a duplicate be created. */
export interface PetBookingConflict {
  pet_id: string;
  booking_id: string;
  service_category: ServiceCategory;
  scheduled_start: string;
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

/** Branch open/close wall-clock time for the requested date - "HH:MM",
 * branch-local. Null when the branch is closed that day. */
export interface OperatingWindow {
  open: string;
  close: string;
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
  /** Custom change (bookings/payments queue paid/unpaid filter). */
  paymentStage?: PaymentStage;
  /** "Assigned to me / no preference" filter - a staff UUID (pass the
   * viewer's own id for "assigned to me"), or the sentinel 'unassigned' for
   * bookings with no assigned staff yet. */
  assignedStaffId?: string;
  /** Opt-in: excludes a Pending/In Progress booking whose downpayment hasn't
   * been paid yet. Used only by the Hotel/Daycare check-in queue pickers. */
  excludeUnpaidDownpayment?: boolean;
}
