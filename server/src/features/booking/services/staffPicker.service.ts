import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  AvailableStaff,
  EffectivePolicy,
  PolicyConfiguration,
  ServiceCategory,
  StaffPickerOption,
} from '../booking.types.ts';
import type { UpdatePolicyInput } from '../modules/validators/booking.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Hardcoded fallback matching the migration's seeded defaults - only used if
 * the seeded system-wide default row has been deleted out-of-band, so the
 * booking flow degrades to documented defaults instead of failing.
 */
const DOCUMENTED_DEFAULTS: EffectivePolicy = {
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: true,
  staff_picker_enabled_grooming: true,
  staff_picker_enabled_veterinary: true,
  lunch_break_enabled: true,
  lunch_break_start: '12:00',
  lunch_break_end: '13:00',
  reschedule_fee_enabled: false,
  reschedule_fee_type: null,
  reschedule_fee_value: null,
  reschedule_free_allowance: null,
  credit_expiry_enabled: true,
  credit_expiry_days: 30,
  cancellation_credit_conversion_rate: 100,
  online_payments_enabled: true,
  downpayment_enabled: false,
  downpayment_type: null,
  downpayment_amount: null,
  downpayment_hold_hours: 24,
};

/** Grooming -> Groomer, Veterinary -> Veterinarian (#52 AC-4). */
const CATEGORY_STAFF_ROLE: Partial<Record<ServiceCategory, string>> = {
  Grooming: 'Groomer',
  Veterinary: 'Veterinarian',
};

export interface AvailabilityWindowParams {
  branchId: string;
  serviceCategory: ServiceCategory;
  scheduledStart: string;
  scheduledEnd: string;
  /** Narrow to one staff member (confirmation-time re-verification shape). */
  staffId?: string;
  /** #54 reschedule re-check: don't let a booking collide with itself. */
  excludeBookingId?: string;
}

/**
 * Effective policy for a branch: branch-specific row wins over the seeded
 * system-wide default row (branch_id NULL), column-for-column as a whole row
 * (the stub has no per-column override semantics).
 */
export async function resolveEffectivePolicy(
  branchId?: string | null
): Promise<EffectivePolicy> {
  let query = supabase.from('policy_configurations').select('*');

  query = branchId
    ? query.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    : query.is('branch_id', null);

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as PolicyConfiguration[];
  const branchRow = branchId
    ? rows.find((row) => row.branch_id === branchId)
    : undefined;
  const defaultRow = rows.find((row) => row.branch_id === null);

  return branchRow ?? defaultRow ?? DOCUMENTED_DEFAULTS;
}

/**
 * Single resolution point the booking-creation flow and the Slot/Staff Picker
 * endpoints all call: should the Staff Picker step render for this branch +
 * service type? Hotel/Daycare never have a picker; Grooming/Veterinary follow
 * the per-branch toggle (default: enabled).
 */
export async function isStaffPickerEnabled(
  branchId: string,
  serviceCategory: ServiceCategory
): Promise<boolean> {
  if (serviceCategory !== 'Grooming' && serviceCategory !== 'Veterinary') {
    return false;
  }

  const policy = await resolveEffectivePolicy(branchId);

  return serviceCategory === 'Grooming'
    ? policy.staff_picker_enabled_grooming
    : policy.staff_picker_enabled_veterinary;
}

/**
 * Whether the customer-facing "Pay" button (PayMongo checkout) should be
 * usable for this branch. The button itself always renders on the customer
 * side even when this is false - it's shown disabled with an explanatory
 * tooltip rather than hidden, so customers aren't left wondering where
 * payment went.
 */
export async function isOnlinePaymentsEnabled(
  branchId: string
): Promise<boolean> {
  const policy = await resolveEffectivePolicy(branchId);
  return policy.online_payments_enabled;
}

export interface DownpaymentPolicy {
  downpayment_enabled: boolean;
  downpayment_type: EffectivePolicy['downpayment_type'];
  downpayment_amount: EffectivePolicy['downpayment_amount'];
  /** Down-payment slot gate: hours from creation before an unpaid
   * down-payment-required Online booking auto-cancels (20260829146). */
  downpayment_hold_hours: EffectivePolicy['downpayment_hold_hours'];
}

/**
 * Per-transaction downpayment config for a branch (system-default + override,
 * same resolution as every other policy field). Applied against a booking's
 * whole total_price at creation time - see createBooking in
 * booking.service.ts - rather than summed per selected catalog item (the
 * old, now-removed services/packages.requires_downpayment mechanism).
 */
export async function resolveDownpaymentPolicy(
  branchId: string
): Promise<DownpaymentPolicy> {
  const policy = await resolveEffectivePolicy(branchId);
  return {
    downpayment_enabled: policy.downpayment_enabled,
    downpayment_type: policy.downpayment_type,
    downpayment_amount: policy.downpayment_amount,
    downpayment_hold_hours: policy.downpayment_hold_hours,
  };
}

/**
 * Minimum-notice lead time, in whole days, that a NEW booking (or the NEW
 * slot of a reschedule) must sit ahead of "now" - advisor addendum: the
 * "3-day minimum" is a booking date-range floor, not just an after-the-fact
 * reschedule/cancellation penalty. 0 when enforcement is off.
 *
 * Distinct from evaluateNoticePeriod (reschedule.service.ts), which measures
 * a change against the booking's CURRENT start. Every caller here already
 * has the effective policy in hand, so this is a pure derivation - no extra
 * query. Walk-ins skip it entirely (their slot is "now").
 */
export function noticeLeadDays(policy: EffectivePolicy): number {
  return policy.notice_enforcement_enabled ? policy.notice_period_days : 0;
}

/**
 * Throws a 422 when `scheduledStart` falls inside the minimum-notice window
 * for `policy`. A no-op when enforcement is off. `action` only shapes the
 * message. Day-granular is handled by getDaySlots for display; this instant
 * comparison is the hard gate a direct API call still has to clear.
 */
export function assertMeetsNoticeLeadTime(
  policy: EffectivePolicy,
  scheduledStart: string,
  action: 'Booking' | 'Reschedule' = 'Booking'
): void {
  const minLeadDays = noticeLeadDays(policy);
  if (minLeadDays <= 0) return;

  const earliest = Date.now() + minLeadDays * 24 * 60 * 60 * 1000;

  if (new Date(scheduledStart).getTime() < earliest) {
    throwWithStatus(
      422,
      `${action} requires at least ${minLeadDays} day(s) notice — please choose a later date`
    );
  }
}

/** Convenience for the availability endpoint / findNextAvailableSlot, which
 * don't otherwise need the policy - one resolve, the day count out. */
export async function resolveNoticeLeadDays(branchId: string): Promise<number> {
  return noticeLeadDays(await resolveEffectivePolicy(branchId));
}

/**
 * Wraps the #49 RPC: eligible staff for a branch/role/time window, filtered
 * by all three availability conditions in the database. Only meaningful for
 * Grooming/Veterinary - other categories have no staff-role mapping.
 */
export async function listAvailableStaff({
  branchId,
  serviceCategory,
  scheduledStart,
  scheduledEnd,
  staffId,
  excludeBookingId,
}: AvailabilityWindowParams): Promise<AvailableStaff[]> {
  const role = CATEGORY_STAFF_ROLE[serviceCategory];

  if (!role) {
    throwWithStatus(
      400,
      `Staff availability does not apply to ${serviceCategory} bookings`
    );
  }

  const { data, error } = await supabase.rpc('get_staff_availability', {
    p_role: role,
    p_branch_id: branchId,
    p_requested_start: scheduledStart,
    p_requested_end: scheduledEnd,
    p_staff_id: staffId ?? null,
    p_exclude_booking_id: excludeBookingId ?? null,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as AvailableStaff[];
}

export interface StaffPickerOptionsResult {
  staff_picker_enabled: boolean;
  options: StaffPickerOption[];
}

/**
 * Staff Picker endpoint payload. When the toggle is disabled the client gets
 * no staff list at all (#52 AC-3) - the flow behaves exactly as though "No
 * preference" were selected and the backend auto-assigns at confirmation.
 * When enabled, "No preference" is always present and always first (#52
 * AC-4).
 */
export async function getStaffPickerOptions(
  params: AvailabilityWindowParams
): Promise<StaffPickerOptionsResult> {
  const enabled = await isStaffPickerEnabled(
    params.branchId,
    params.serviceCategory
  );

  if (!enabled) {
    return { staff_picker_enabled: false, options: [] };
  }

  const staff = await listAvailableStaff(params);

  return {
    staff_picker_enabled: true,
    options: [
      { type: 'no_preference' },
      ...staff.map((member) => ({
        type: 'specific' as const,
        staff_id: member.staff_id,
        display_name: member.display_name,
        profile_photo_url: member.profile_photo_url,
      })),
    ],
  };
}

/**
 * Uniform random pick among eligible staff - shared by autoAssignStaff below
 * and reschedule.service.ts's own "no preference" fallback, so both actually
 * spread load across every eligible staff member instead of the RPC's
 * display_name ordering always favoring the same one.
 */
export function pickRandomAvailableStaff(
  staff: AvailableStaff[]
): AvailableStaff | undefined {
  if (staff.length === 0) return undefined;
  return staff[Math.floor(Math.random() * staff.length)];
}

/**
 * "No preference" resolution: a random eligible staff member at confirmation
 * time (see pickRandomAvailableStaff - deliberately not the RPC's own
 * display_name ordering, so assignment isn't always the same person). Returns
 * null when nobody is eligible (a capacity error upstream).
 */
export async function autoAssignStaff(
  params: AvailabilityWindowParams
): Promise<AvailableStaff | null> {
  const staff = await listAvailableStaff(params);
  return pickRandomAvailableStaff(staff) ?? null;
}

interface UpdatePolicyParams {
  input: UpdatePolicyInput;
}

/**
 * Admin/Superadmin PATCH (#52 AC-2): updates the system-wide default row
 * (branch_id null/omitted) or a branch's override row, creating the override
 * row if none exists - seeded from the effective policy so a partial PATCH
 * doesn't silently reset the other settings to column defaults.
 */
export async function updatePolicyConfiguration({
  input,
}: UpdatePolicyParams): Promise<PolicyConfiguration> {
  const { branch_id: branchId = null, ...settings } = input;

  let existingQuery = supabase.from('policy_configurations').select('*');

  existingQuery = branchId
    ? existingQuery.eq('branch_id', branchId)
    : existingQuery.is('branch_id', null);

  const { data: existing, error: lookupError } =
    await existingQuery.maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);

  if (existing) {
    const { data, error } = await supabase
      .from('policy_configurations')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', (existing as PolicyConfiguration).id)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throwWithStatus(400, error?.message ?? 'Failed to update policy');
    }

    return data as PolicyConfiguration;
  }

  const resolved = await resolveEffectivePolicy(branchId);
  // Only the policy fields - resolveEffectivePolicy may hand back a full
  // row (id/created_at included), which must not leak into the new row.
  const baseline: EffectivePolicy = {
    notice_period_days: resolved.notice_period_days,
    notice_enforcement_mode: resolved.notice_enforcement_mode,
    notice_enforcement_enabled: resolved.notice_enforcement_enabled,
    staff_picker_enabled_grooming: resolved.staff_picker_enabled_grooming,
    staff_picker_enabled_veterinary: resolved.staff_picker_enabled_veterinary,
    lunch_break_enabled: resolved.lunch_break_enabled,
    lunch_break_start: resolved.lunch_break_start,
    lunch_break_end: resolved.lunch_break_end,
    reschedule_fee_enabled: resolved.reschedule_fee_enabled,
    reschedule_fee_type: resolved.reschedule_fee_type,
    reschedule_fee_value: resolved.reschedule_fee_value,
    reschedule_free_allowance: resolved.reschedule_free_allowance,
    credit_expiry_enabled: resolved.credit_expiry_enabled,
    credit_expiry_days: resolved.credit_expiry_days,
    cancellation_credit_conversion_rate:
      resolved.cancellation_credit_conversion_rate,
    online_payments_enabled: resolved.online_payments_enabled,
    downpayment_enabled: resolved.downpayment_enabled,
    downpayment_type: resolved.downpayment_type,
    downpayment_amount: resolved.downpayment_amount,
    downpayment_hold_hours: resolved.downpayment_hold_hours,
  };

  const { data, error } = await supabase
    .from('policy_configurations')
    .insert({ ...baseline, ...settings, branch_id: branchId })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create policy row');
  }

  return data as PolicyConfiguration;
}

/**
 * Read surface for the policy panel: the raw rows (default + overrides) so
 * the Admin UI can show which branches deviate from the default.
 */
export async function listPolicyConfigurations(): Promise<
  PolicyConfiguration[]
> {
  const { data, error } = await supabase
    .from('policy_configurations')
    .select('*')
    .order('created_at');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as PolicyConfiguration[];
}
