import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { AvailableStaff, ServiceCategory } from '../booking.types.ts';
import {
  filterSameSizeRows,
  getDaycareSessionCapacity,
  getHotelCageCapacity,
  listOverlappingActiveBookings,
  type WeightClass,
} from './capacity.service.ts';
import {
  listAvailableStaff,
  noticeLeadDays,
  resolveEffectivePolicy,
  resolveNoticeLeadDays,
} from './staffPicker.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Supporting infra for #56 (Slot Picker UI) and #60 (Receptionist Bookings
 * Queue): neither issue in the merged #51/#52 backend exposed a read
 * endpoint the client could call ahead of submission - checkCapacity() is
 * server-internal only, gated by env-var stub config the client can't reach.
 * This mirrors checkCapacity's per-category logic across a whole day of
 * candidate slots, generated from the branch's operating_hours (#49's RPC
 * already reads the same jsonb column for its own Check 1).
 */

const CATEGORY_STAFF_ROLE: Partial<Record<ServiceCategory, string>> = {
  Grooming: 'Groomer',
  Veterinary: 'Veterinarian',
};

/** Arrival-time granularity for Hotel candidates - independent of the stay's
 * own duration (slotDurationMinutes), which only sets how far `end` extends. */
const HOTEL_ARRIVAL_STEP_MS = 60 * 60000;

export type SlotLevel = 'available' | 'partial' | 'full';

export interface SlotAvailability {
  start: string;
  end: string;
  available: boolean;
  level: SlotLevel;
  /** Grooming/Veterinary only - how many eligible staff remain for this slot. */
  eligible_staff_count?: number;
  /** Hotel only - how many petWeightClass-size cages remain free/total, so
   * the booking flow can show real cage availability instead of just an
   * enabled/disabled button with no explanation. */
  cage_capacity_remaining?: number;
  cage_capacity_total?: number;
}

export interface GetDaySlotsParams {
  branchId: string;
  serviceCategory: ServiceCategory;
  /** YYYY-MM-DD, interpreted in the branch's own timezone. */
  date: string;
  slotDurationMinutes: number;
  /** Required (and only meaningful) for Hotel. */
  petWeightClass?: WeightClass;
}

interface BranchRow {
  operating_hours: Record<string, { open: string; close: string } | undefined>;
  timezone: string;
}

/**
 * Offset (in minutes) that must be ADDED to a UTC instant to get the
 * wall-clock time in `timeZone` - i.e. localTime = utcInstant + offset.
 * Uses Intl's tz database instead of a date library (none is a project
 * dependency - see client's package.json survey), the standard
 * library-free technique for IANA zone conversion in Node.
 */
function tzOffsetMinutes(utcInstant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcInstant);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );

  return (asIfUtc - utcInstant.getTime()) / 60000;
}

/** Converts a branch-local "date + HH:MM" wall-clock time to a UTC Date. */
function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  // The branch's actual offset can only be evaluated against an instant, so
  // approximate with asIfUtc first, then correct - safe for the fixed,
  // non-DST-observing 'Asia/Manila' zone every branch currently uses, and
  // still correct in general since a second pass would only matter across a
  // DST transition, which PH branches never have.
  const offsetMinutes = tzOffsetMinutes(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - offsetMinutes * 60000);
}

async function countActiveRoster(
  branchId: string,
  role: string
): Promise<number> {
  const { count, error } = await supabase
    .from('staff_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .eq('role', role)
    .eq('is_active', true);

  if (error) throwWithStatus(400, error.message);

  return count ?? 0;
}

function levelFromUsage(occupied: number, capacity: number): SlotLevel {
  if (capacity <= 0 || occupied >= capacity) return 'full';
  if (occupied <= 0) return 'available';
  return 'partial';
}

export interface OperatingWindow {
  /** "HH:MM", branch-local wall-clock time. */
  open: string;
  close: string;
}

export interface ResolveOperatingWindowParams {
  branchId: string;
  /** YYYY-MM-DD, interpreted in the branch's own timezone. */
  date: string;
}

/**
 * The branch's open/close wall-clock times for a single date, so the
 * client's hybrid time input can bound what it accepts (typed or picked)
 * without duplicating getDaySlots' own slot-stepping - this only resolves
 * the window, not the stepped candidate list, and doesn't change getDaySlots'
 * own signature/return shape (still consumed as-is by capacity.service.ts,
 * reschedule.service.ts, and existing specs).
 */
export async function resolveOperatingWindow({
  branchId,
  date,
}: ResolveOperatingWindowParams): Promise<OperatingWindow | null> {
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('operating_hours, timezone')
    .eq('id', branchId)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);
  if (!branch) throwWithStatus(404, 'Branch not found');

  const { operating_hours: operatingHours, timezone } = branch as BranchRow;

  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  })
    .format(zonedTimeToUtc(date, '12:00', timezone))
    .toLowerCase();

  return operatingHours?.[dayName] ?? null;
}

/**
 * One day's worth of candidate slots for the Slot Picker, stepped back-to-
 * back by slotDurationMinutes across the branch's operating hours for that
 * day of week. Returns an empty list when the branch is closed that day
 * (#56 AC-3's empty state) rather than an error.
 */
export async function getDaySlots({
  branchId,
  serviceCategory,
  date,
  slotDurationMinutes,
  petWeightClass,
}: GetDaySlotsParams): Promise<SlotAvailability[]> {
  if (serviceCategory === 'Hotel' && !petWeightClass) {
    throwWithStatus(400, 'pet_weight_class is required for Hotel availability');
  }

  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('operating_hours, timezone')
    .eq('id', branchId)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);
  if (!branch) throwWithStatus(404, 'Branch not found');

  const { operating_hours: operatingHours, timezone } = branch as BranchRow;

  // A fully past date is never bookable, in any category - previously Hotel
  // was exempt from every time-based check below (by design, for its
  // single opening-time candidate), which left a past date's slot showing
  // as bookable indefinitely (repro: navigating the Slot Picker back a few
  // days still showed a green/available Hotel slot). YYYY-MM-DD strings
  // sort lexically, so a plain string comparison against "today" in the
  // branch's own timezone is enough - no Date parsing/timezone math needed.
  const todayInBranchTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
  }).format(new Date());

  if (date < todayInBranchTz) {
    return [];
  }

  // One effective-policy resolve for this call - feeds both the
  // minimum-notice date floor here and the lunch-break filter further down.
  const policy = await resolveEffectivePolicy(branchId);

  // Minimum-notice lead time (advisor addendum): when notice enforcement is
  // on, the earliest bookable calendar date is N days out - every earlier
  // day comes back empty, exactly like a closed day, so the Slot Picker and
  // findNextAvailableSlot both skip past the notice window as a date range
  // rather than showing pinned, unbookable near-term days. Day-granular (not
  // an instant) so there is no confusing half-open first day. Walk-ins never
  // reach this path (their slot is "now", not browsed).
  const minLeadDays = noticeLeadDays(policy);

  if (
    minLeadDays > 0 &&
    date < addDaysToDateString(todayInBranchTz, minLeadDays)
  ) {
    return [];
  }

  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  })
    .format(zonedTimeToUtc(date, '12:00', timezone))
    .toLowerCase();

  const window = operatingHours?.[dayName];

  if (!window) {
    return [];
  }

  const openUtc = zonedTimeToUtc(date, window.open, timezone);
  const closeUtc = zonedTimeToUtc(date, window.close, timezone);
  const stepMs = slotDurationMinutes * 60000;

  const candidates: Array<{ start: Date; end: Date }> = [];

  if (serviceCategory === 'Hotel') {
    // A Hotel stay's duration (the seeded service's 1440-minute/one-night
    // length) routinely runs past this same day's close time by design - the
    // stay continues into the next day, unlike a same-day Grooming/
    // Veterinary/Daycare appointment. Arrival TIME is still meaningful
    // though (the customer picks when they'll drop the pet off), so
    // candidates step hourly across [open, close) the same way every other
    // category steps by its own slotDurationMinutes - just with `end`
    // always start + the full stay length, never bounded by same-day close.
    for (
      let start = openUtc.getTime();
      start < closeUtc.getTime();
      start += HOTEL_ARRIVAL_STEP_MS
    ) {
      candidates.push({
        start: new Date(start),
        end: new Date(start + stepMs),
      });
    }
  } else {
    for (
      let start = openUtc.getTime();
      start + stepMs <= closeUtc.getTime();
      start += stepMs
    ) {
      candidates.push({
        start: new Date(start),
        end: new Date(start + stepMs),
      });
    }
  }

  // Fixed lunch break: drops any candidate whose [start, end) overlaps the
  // branch's effective policy window (default 12:00-13:00), the same
  // resolveEffectivePolicy() staffPicker.service.ts already uses elsewhere -
  // single source of truth for default-vs-branch-override precedence.
  // Applies to every category uniformly since Hotel/Daycare route through
  // this same candidate list ("cannot book at this time" is a blanket rule).
  let lunchCandidates = candidates;

  if (policy.lunch_break_enabled) {
    const lunchStartUtc = zonedTimeToUtc(
      date,
      policy.lunch_break_start.slice(0, 5),
      timezone
    );
    const lunchEndUtc = zonedTimeToUtc(
      date,
      policy.lunch_break_end.slice(0, 5),
      timezone
    );

    lunchCandidates = candidates.filter(
      (candidate) =>
        candidate.start.getTime() >= lunchEndUtc.getTime() ||
        candidate.end.getTime() <= lunchStartUtc.getTime()
    );
  }

  // A slot whose start time is already in the past is never a real option
  // (e.g. 8:00 AM showing as bookable at 3:00 PM) - applies to every
  // category, Hotel included now that Hotel offers real arrival-time
  // candidates rather than a single day-level flag. The same filter also
  // enforces the minimum-notice lead time to the exact instant, so the
  // first bookable day's earlier slots (before now + N days) drop out
  // rather than being offered here and then 422'd by assertMeetsNoticeLeadTime.
  const earliestStartMs = Date.now() + minLeadDays * 24 * 60 * 60 * 1000;
  const futureCandidates = lunchCandidates.filter(
    (candidate) => candidate.start.getTime() > earliestStartMs
  );

  const role = CATEGORY_STAFF_ROLE[serviceCategory];

  if (role) {
    const roster = await countActiveRoster(branchId, role);

    const slots = await Promise.all(
      futureCandidates.map(async ({ start, end }) => {
        const eligible: AvailableStaff[] = await listAvailableStaff({
          branchId,
          serviceCategory,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
        });

        return {
          start: start.toISOString(),
          end: end.toISOString(),
          available: eligible.length > 0,
          level: levelFromUsage(roster - eligible.length, roster),
          eligible_staff_count: eligible.length,
        };
      })
    );

    return slots;
  }

  // Hotel/Daycare: capacity-count path, mirroring checkCapacity exactly.
  return Promise.all(
    futureCandidates.map(async ({ start, end }) => {
      const params = {
        branchId,
        serviceCategory,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      };

      const overlapping = await listOverlappingActiveBookings(params);

      if (serviceCategory === 'Hotel') {
        const sameSize = await filterSameSizeRows(overlapping, petWeightClass!);
        const capacity = await getHotelCageCapacity(branchId, petWeightClass!);

        return {
          start: start.toISOString(),
          end: end.toISOString(),
          available: sameSize.length < capacity,
          level: levelFromUsage(sameSize.length, capacity),
          cage_capacity_remaining: Math.max(capacity - sameSize.length, 0),
          cage_capacity_total: capacity,
        };
      }

      const capacity = getDaycareSessionCapacity(branchId);

      return {
        start: start.toISOString(),
        end: end.toISOString(),
        available: overlapping.length < capacity,
        level: levelFromUsage(overlapping.length, capacity),
      };
    })
  );
}

const DEFAULT_LOOKAHEAD_DAYS = 14;

export interface FindNextAvailableSlotParams {
  branchId: string;
  serviceCategory: ServiceCategory;
  /** YYYY-MM-DD, branch-local - search starts here (inclusive). */
  fromDate: string;
  slotDurationMinutes: number;
  petWeightClass?: WeightClass;
  lookaheadDays?: number;
}

export interface NextAvailableSlot {
  date: string;
  earliestSlot: { start: string; end: string };
}

function nextDateString(date: string): string {
  return addDaysToDateString(date, 1);
}

/** Calendar-date arithmetic on a YYYY-MM-DD string, via UTC midnight so it is
 * immune to the host's local offset. */
function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * #22: lets the booking flow warn a customer "fully booked" before they
 * reach the Slot Picker step, by walking getDaySlots forward day by day
 * until it finds one with at least one available candidate (or exhausts
 * lookaheadDays). Reuses getDaySlots as-is rather than a parallel capacity
 * query, so this always agrees with what the Slot Picker itself would show
 * for that date.
 */
export async function findNextAvailableSlot({
  branchId,
  serviceCategory,
  fromDate,
  slotDurationMinutes,
  petWeightClass,
  lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
}: FindNextAvailableSlotParams): Promise<NextAvailableSlot | null> {
  // The minimum-notice window (getDaySlots returns [] for every day inside
  // it) is skipped for free rather than eating into lookaheadDays - the
  // caller asked for N bookable days of look-ahead, not N days total.
  const minLeadDays = await resolveNoticeLeadDays(branchId);
  let cursor = fromDate;

  for (let i = 0; i < lookaheadDays + minLeadDays; i += 1) {
    const slots = await getDaySlots({
      branchId,
      serviceCategory,
      date: cursor,
      slotDurationMinutes,
      petWeightClass,
    });

    const earliest = slots.find((slot) => slot.available);
    if (earliest) {
      return {
        date: cursor,
        earliestSlot: { start: earliest.start, end: earliest.end },
      };
    }

    cursor = nextDateString(cursor);
  }

  return null;
}

const PART_OF_DAY_BANDS: Record<
  'Morning' | 'Afternoon' | 'Evening',
  { startMin: number; endMin: number }
> = {
  Morning: { startMin: 0, endMin: 12 * 60 },
  Afternoon: { startMin: 12 * 60, endMin: 17 * 60 },
  Evening: { startMin: 17 * 60, endMin: 24 * 60 },
};

function minutesFromHHMM(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/**
 * #22: which Morning/Afternoon/Evening walk/play blocks actually fall
 * inside a branch's operating hours for a given date - e.g. a branch that
 * closes at 15:00 never offers 'Evening'. Returns all three when the branch
 * has no operating-hours entry for that date (closed, or nothing to
 * constrain against) so callers don't need a separate "branch closed"
 * branch of logic - an empty set would be more confusing than an
 * unconstrained one here, since walk/play scheduling at booking time is
 * advisory, not a hard slot reservation the way getDaySlots' candidates are.
 */
export async function partsOfDayWithinOperatingHours(
  params: ResolveOperatingWindowParams
): Promise<Array<'Morning' | 'Afternoon' | 'Evening'>> {
  const window = await resolveOperatingWindow(params);
  if (!window) return ['Morning', 'Afternoon', 'Evening'];

  const openMin = minutesFromHHMM(window.open);
  const closeMin = minutesFromHHMM(window.close);

  return (
    Object.keys(PART_OF_DAY_BANDS) as Array<'Morning' | 'Afternoon' | 'Evening'>
  ).filter((part) => {
    const band = PART_OF_DAY_BANDS[part];
    return band.startMin < closeMin && band.endMin > openMin;
  });
}

/**
 * #22: how many of the branch's daily closing times fall strictly between
 * checkInAt and checkOutAt - i.e. how many nights a daycare pet was still
 * there when the branch closed (0 for a same-day pickup before close,
 * matching today's behavior exactly). Used to add a flat per-night
 * overnight/no-pickup fee on top of the usual hourly daycare charge
 * (daycareBilling.service.ts).
 */
export async function countOvernightNights(
  checkInAt: Date,
  checkOutAt: Date,
  branchId: string
): Promise<number> {
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('operating_hours, timezone')
    .eq('id', branchId)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);
  if (!branch) throwWithStatus(404, 'Branch not found');

  const { operating_hours: operatingHours, timezone } = branch as BranchRow;

  const branchLocalDate = (instant: Date): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(instant);

  let nights = 0;
  let cursor = branchLocalDate(checkInAt);
  const lastDate = branchLocalDate(checkOutAt);

  while (cursor <= lastDate) {
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    })
      .format(zonedTimeToUtc(cursor, '12:00', timezone))
      .toLowerCase();

    const window = operatingHours?.[dayName];

    if (window) {
      const closeInstant = zonedTimeToUtc(cursor, window.close, timezone);
      if (
        closeInstant.getTime() > checkInAt.getTime() &&
        closeInstant.getTime() < checkOutAt.getTime()
      ) {
        nights += 1;
      }
    }

    cursor = nextDateString(cursor);
  }

  return nights;
}
