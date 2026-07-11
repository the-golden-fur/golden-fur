import { supabase } from '../../../config/supabase/supabase.config.ts';

interface OperatingHoursEntry {
  open: string;
  close: string;
}

type OperatingHours = Record<string, OperatingHoursEntry>;

export interface AvailabilityWindow {
  start: string;
  end: string;
}

export interface DayAvailability {
  date: string;
  availableWindows: AvailabilityWindow[];
}

export interface BookingOverlapParams {
  considerBookings?: boolean;
}

export interface BookingOverlapPlaceholder {
  considered: false;
  message: string;
}

export interface StaffAvailabilityParams {
  staffId: string;
  rangeStart: string;
  rangeEnd: string;
  bookingOverlap?: BookingOverlapParams;
}

export interface StaffAvailabilityResult {
  staffId: string;
  branchId: string;
  timezone: string;
  days: DayAvailability[];
  bookingOverlap: BookingOverlapPlaceholder;
}

interface UnavailabilityBlockRow {
  start_time: string;
  end_time: string;
}

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function parseDateParts(dateStr: string): [number, number, number] {
  if (!DATE_PATTERN.test(dateStr)) {
    throwWithStatus(400, `Invalid date "${dateStr}", expected YYYY-MM-DD`);
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  return [year, month, day];
}

function weekdayNameForDate(dateStr: string): string {
  const [year, month, day] = parseDateParts(dateStr);
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function addOneDay(dateStr: string): string {
  const [year, month, day] = parseDateParts(dateStr);
  const next = new Date(Date.UTC(year, month - 1, day + 1));

  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function enumerateDates(rangeStart: string, rangeEnd: string): string[] {
  const [sy, sm, sd] = parseDateParts(rangeStart);
  const [ey, em, ed] = parseDateParts(rangeEnd);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);

  if (endMs < startMs) {
    throwWithStatus(400, 'rangeEnd must not be before rangeStart');
  }

  const dates: string[] = [];

  for (let ms = startMs; ms <= endMs; ms += 24 * 60 * 60 * 1000) {
    const d = new Date(ms);

    dates.push(
      [
        d.getUTCFullYear(),
        String(d.getUTCMonth() + 1).padStart(2, '0'),
        String(d.getUTCDate()).padStart(2, '0'),
      ].join('-')
    );
  }

  return dates;
}

function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - date.getTime();
}

/**
 * Converts a branch-local calendar date + HH:MM time (e.g. an operating-hours
 * open/close entry) into the real UTC instant it represents, mirroring the
 * offset resolution unavailabilityBlock.service.ts uses for "end of shift".
 */
function localDateTimeToInstant(
  timezone: string,
  dateStr: string,
  timeStr: string
): Date {
  const [year, month, day] = parseDateParts(dateStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  const naiveLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = getTimezoneOffsetMs(timezone, new Date(naiveLocalMs));

  return new Date(naiveLocalMs - offsetMs);
}

function subtractInterval(
  windows: AvailabilityWindow[],
  block: AvailabilityWindow
): AvailabilityWindow[] {
  const result: AvailabilityWindow[] = [];
  const blockStartMs = new Date(block.start).getTime();
  const blockEndMs = new Date(block.end).getTime();

  for (const window of windows) {
    const windowStartMs = new Date(window.start).getTime();
    const windowEndMs = new Date(window.end).getTime();

    if (blockEndMs <= windowStartMs || blockStartMs >= windowEndMs) {
      result.push(window);
      continue;
    }

    if (blockStartMs > windowStartMs) {
      result.push({
        start: window.start,
        end: new Date(blockStartMs).toISOString(),
      });
    }

    if (blockEndMs < windowEndMs) {
      result.push({
        start: new Date(blockEndMs).toISOString(),
        end: window.end,
      });
    }
  }

  return result;
}

function resolveBookingOverlapPlaceholder(
  params?: BookingOverlapParams
): BookingOverlapPlaceholder {
  return {
    considered: false,
    message: params?.considerBookings
      ? 'Booking overlap was requested but the bookings table does not exist yet (Sprint 2, M03) — no bookings were considered.'
      : 'Booking overlap is not yet considered — the bookings table does not exist yet (Sprint 2, M03).',
  };
}

/**
 * Read-side reference implementation for staff availability: intersects a
 * branch's operating_hours for each day in [rangeStart, rangeEnd] with the
 * inverse of that staff member's *approved* staff_unavailability_blocks.
 * Not get_staff_availability() itself — see Issue #27's dev notes; Sprint 2's
 * M03 epic ports this same 3-condition shape into the real RPC.
 */
export async function getStaffAvailability({
  staffId,
  rangeStart,
  rangeEnd,
  bookingOverlap,
}: StaffAvailabilityParams): Promise<StaffAvailabilityResult> {
  const dates = enumerateDates(rangeStart, rangeEnd);

  const { data: staffProfile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('id, branch_id')
    .eq('id', staffId)
    .maybeSingle();

  if (profileError) throwWithStatus(400, profileError.message);
  if (!staffProfile) throwWithStatus(404, 'Staff profile not found');

  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('operating_hours, timezone')
    .eq('id', staffProfile.branch_id)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);
  if (!branch) throwWithStatus(400, 'Branch not found for staff member');

  const operatingHours: OperatingHours = branch.operating_hours ?? {};
  const timezone: string = branch.timezone;

  const queryStart = localDateTimeToInstant(timezone, dates[0], '00:00');
  const queryEnd = localDateTimeToInstant(
    timezone,
    addOneDay(dates[dates.length - 1]),
    '00:00'
  );

  const { data: blocks, error: blocksError } = await supabase
    .from('staff_unavailability_blocks')
    .select('start_time, end_time')
    .eq('staff_id', staffId)
    .eq('status', 'approved')
    .lt('start_time', queryEnd.toISOString())
    .gt('end_time', queryStart.toISOString());

  if (blocksError) throwWithStatus(400, blocksError.message);

  const approvedBlocks = (blocks ?? []) as UnavailabilityBlockRow[];

  const days: DayAvailability[] = dates.map((dateStr) => {
    const hours = operatingHours[weekdayNameForDate(dateStr)];

    if (!hours?.open || !hours?.close) {
      return { date: dateStr, availableWindows: [] };
    }

    const openInstant = localDateTimeToInstant(timezone, dateStr, hours.open);
    const closeInstant = localDateTimeToInstant(
      timezone,
      dateStr,
      hours.close
    );

    if (closeInstant <= openInstant) {
      return { date: dateStr, availableWindows: [] };
    }

    let windows: AvailabilityWindow[] = [
      { start: openInstant.toISOString(), end: closeInstant.toISOString() },
    ];

    const overlappingBlocks = approvedBlocks
      .filter(
        (block) =>
          new Date(block.start_time) < closeInstant &&
          new Date(block.end_time) > openInstant
      )
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

    for (const block of overlappingBlocks) {
      windows = subtractInterval(windows, {
        start: block.start_time,
        end: block.end_time,
      });
    }

    return { date: dateStr, availableWindows: windows };
  });

  return {
    staffId,
    branchId: staffProfile.branch_id,
    timezone,
    days,
    bookingOverlap: resolveBookingOverlapPlaceholder(bookingOverlap),
  };
}
