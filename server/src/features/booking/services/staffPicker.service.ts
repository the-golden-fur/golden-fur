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
  booking_notice_period_days: 0,
  staff_picker_enabled_grooming: true,
  staff_picker_enabled_veterinary: true,
  lunch_break_enabled: true,
  lunch_break_start: '12:00',
  lunch_break_end: '13:00',
  reschedule_fee_enabled: false,
  reschedule_fee_type: null,
  reschedule_fee_value: null,
  reschedule_free_allowance: null,
  credit_expiry_mode: 'rolling',
  credit_expiry_days: 30,
  credit_expiry_fixed_date: null,
  cancellation_credit_conversion_rate: 100,
  online_payments_enabled: true,
  // Mirrors the seeded system-default row (20260902161): downpayment enabled
  // system-wide at 50% of the discounted net total. Only used if that row is
  // deleted out-of-band.
  downpayment_enabled: true,
  downpayment_type: 'Percentage',
  downpayment_amount: 50,
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
 * Reschedule minimum-notice lead time, in whole days, that the NEW slot of a
 * reschedule must sit ahead of "now". 0 when enforcement is off.
 *
 * NEW bookings do NOT use this - they have their own knob, see
 * bookingLeadDays(). Also distinct from evaluateNoticePeriod
 * (reschedule.service.ts), which measures a change against the booking's
 * CURRENT start.
 */
export function noticeLeadDays(policy: EffectivePolicy): number {
  return policy.notice_enforcement_enabled ? policy.notice_period_days : 0;
}

/**
 * New-online-booking lead time, in whole days, that a NEW booking's
 * `scheduled_start` must sit ahead of "today". 0 = same-day bookings allowed
 * (the default). Its own policy column, independent of the reschedule notice
 * (noticeLeadDays) - Architectural-Change-History: the 3-day rule is for
 * reschedules only. Walk-ins skip it entirely (their slot is "now").
 */
export function bookingLeadDays(policy: EffectivePolicy): number {
  return policy.booking_notice_period_days;
}

/** Calendar-date arithmetic on a YYYY-MM-DD string, via UTC midnight so it is
 * immune to the host's local offset. Mirrors availability.service.ts's own
 * copy (kept local here to avoid a service<->service import cycle). */
function shiftDateString(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Throws a 422 when `scheduledStart` falls inside the reschedule
 * minimum-notice window for `policy`. A no-op when enforcement is off.
 * `action` only shapes the message. Instant comparison - the hard gate a
 * direct API call still has to clear on top of getDaySlots' day-level filter.
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

/**
 * Throws a 422 when a NEW booking's `scheduledStart` is earlier than
 * `today + booking_notice_period_days`, both evaluated as calendar dates in
 * the branch's own timezone - so "2 days notice" means "the day after
 * tomorrow onwards", never a rolling 48h instant. A no-op at the default 0.
 * The hard gate behind getDaySlots' day-level filter that a direct API call
 * still has to clear.
 */
export async function assertMeetsBookingLeadTime(
  policy: EffectivePolicy,
  scheduledStart: string,
  branchId: string
): Promise<void> {
  const leadDays = bookingLeadDays(policy);
  if (!leadDays || leadDays <= 0) return;

  const { data: branch, error } = await supabase
    .from('branches')
    .select('timezone')
    .eq('id', branchId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  const timeZone = (branch as { timezone?: string } | null)?.timezone ?? 'UTC';

  const asDate = (instant: Date): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

  const earliestDate = shiftDateString(asDate(new Date()), leadDays);

  if (asDate(new Date(scheduledStart)) < earliestDate) {
    throwWithStatus(
      422,
      `This branch needs at least ${leadDays} day(s) notice for a new booking — please choose a later date`
    );
  }
}

/** Convenience for the availability endpoint / findNextAvailableSlot, which
 * don't otherwise need the policy - one resolve, the day count out. */
export async function resolveNoticeLeadDays(branchId: string): Promise<number> {
  return noticeLeadDays(await resolveEffectivePolicy(branchId));
}

/** New-booking counterpart of resolveNoticeLeadDays. */
export async function resolveBookingLeadDays(
  branchId: string
): Promise<number> {
  return bookingLeadDays(await resolveEffectivePolicy(branchId));
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

type CreditExpirySnapshot = Pick<
  EffectivePolicy,
  'credit_expiry_mode' | 'credit_expiry_days' | 'credit_expiry_fixed_date'
>;

function creditExpiryUnchanged(
  a: CreditExpirySnapshot,
  b: CreditExpirySnapshot
): boolean {
  return (
    a.credit_expiry_mode === b.credit_expiry_mode &&
    a.credit_expiry_days === b.credit_expiry_days &&
    a.credit_expiry_fixed_date === b.credit_expiry_fixed_date
  );
}

/**
 * A credit-expiry rule change is retroactive: re-stamp `expires_at` on every
 * not-yet-swept `issuance` row at the affected branch(es) to match the new
 * mode, so "entire branch credits expire at X date" (and relaxing it again)
 * covers credit customers already hold, not just future issuances.
 * `expire_credits()` then sweeps them on its normal schedule.
 *
 * No-op unless the effective mode/days/date for the branch actually changed
 * (the Policies page PATCHes all fields on every save, so an unrelated edit
 * like the lunch break must not fan a re-stamp out across every branch).
 *
 * Best-effort: a failure here is logged and the policy save still succeeds
 * (mirrors the #117 credit-issuance non-gating precedent).
 *
 * Affected branches: the one concrete branch when a branch-override row was
 * saved; every branch with no override of its own when the system-default
 * row was saved (exactly the branches resolveEffectivePolicy hands the
 * default row).
 */
async function reapplyCreditExpiryAfterPolicyChange(
  branchId: string | null,
  before: CreditExpirySnapshot,
  after: CreditExpirySnapshot
): Promise<void> {
  if (creditExpiryUnchanged(before, after)) return;

  try {
    let branchIds: string[];
    if (branchId) {
      branchIds = [branchId];
    } else {
      const { data: allBranches, error: branchesError } = await supabase
        .from('branches')
        .select('id');
      if (branchesError) throw new Error(branchesError.message);

      const { data: overrideRows, error: overrideError } = await supabase
        .from('policy_configurations')
        .select('branch_id')
        .not('branch_id', 'is', null);
      if (overrideError) throw new Error(overrideError.message);

      const overridden = new Set(
        (overrideRows ?? []).map(
          (row) => (row as { branch_id: string }).branch_id
        )
      );
      branchIds = (allBranches ?? [])
        .map((row) => (row as { id: string }).id)
        .filter((id) => !overridden.has(id));
    }

    if (branchIds.length === 0) return;

    const { error } = await supabase.rpc('reapply_branch_credit_expiry', {
      p_branch_ids: branchIds,
      p_mode: after.credit_expiry_mode,
      p_days: after.credit_expiry_days,
      p_fixed_date: after.credit_expiry_fixed_date,
    });
    if (error) throw new Error(error.message);
  } catch (reapplyError) {
    // eslint-disable-next-line no-console
    console.error(
      'reapplyCreditExpiryAfterPolicyChange failed (policy still saved):',
      reapplyError
    );
  }
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

  // credit_expiry_fixed_date only means anything in 'fixed_date' mode - clear
  // it whenever the mode is being set to something else, so a stale date
  // can't linger on the row (the validator only rejects a date sent *with* a
  // non-fixed mode, not a mode change that omits the date field).
  if (
    settings.credit_expiry_mode !== undefined &&
    settings.credit_expiry_mode !== 'fixed_date'
  ) {
    settings.credit_expiry_fixed_date = null;
  }

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

    await reapplyCreditExpiryAfterPolicyChange(
      branchId,
      existing as PolicyConfiguration,
      data as PolicyConfiguration
    );

    return data as PolicyConfiguration;
  }

  const resolved = await resolveEffectivePolicy(branchId);
  // Only the policy fields - resolveEffectivePolicy may hand back a full
  // row (id/created_at included), which must not leak into the new row.
  const baseline: EffectivePolicy = {
    notice_period_days: resolved.notice_period_days,
    notice_enforcement_mode: resolved.notice_enforcement_mode,
    notice_enforcement_enabled: resolved.notice_enforcement_enabled,
    booking_notice_period_days: resolved.booking_notice_period_days,
    staff_picker_enabled_grooming: resolved.staff_picker_enabled_grooming,
    staff_picker_enabled_veterinary: resolved.staff_picker_enabled_veterinary,
    lunch_break_enabled: resolved.lunch_break_enabled,
    lunch_break_start: resolved.lunch_break_start,
    lunch_break_end: resolved.lunch_break_end,
    reschedule_fee_enabled: resolved.reschedule_fee_enabled,
    reschedule_fee_type: resolved.reschedule_fee_type,
    reschedule_fee_value: resolved.reschedule_fee_value,
    reschedule_free_allowance: resolved.reschedule_free_allowance,
    credit_expiry_mode: resolved.credit_expiry_mode,
    credit_expiry_days: resolved.credit_expiry_days,
    credit_expiry_fixed_date: resolved.credit_expiry_fixed_date,
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

  // `resolved` is what this branch's credit followed before the override
  // existed; a new row whose credit fields match it changes no lots.
  await reapplyCreditExpiryAfterPolicyChange(
    branchId,
    resolved,
    data as PolicyConfiguration
  );

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
