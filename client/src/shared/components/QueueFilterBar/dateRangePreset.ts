export type DateRangePreset =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'this_month'
  | 'custom'
  | 'all';

export interface DateRangeBounds {
  /** YYYY-MM-DD, inclusive. Null means unbounded. */
  from: string | null;
  /** YYYY-MM-DD, inclusive. Null means unbounded. */
  to: string | null;
}

export const DATE_RANGE_PRESET_OPTIONS: Array<{
  value: DateRangePreset;
  label: string;
}> = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom date' },
  { value: 'all', label: 'All dates' },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves a preset to an inclusive [from, to] date range, computed in UTC
 * calendar terms - matching the server's own day-boundary queries
 * (todayRangeUtc() in grooming.service.ts/consultation.service.ts, and
 * booking.service.ts's date-filter logic) so "Today" here lines up exactly
 * with what the backend considers today. Weeks run Monday-Sunday.
 *
 * `customDate` (YYYY-MM-DD) is only consulted for the 'custom' preset - it's
 * the single day picked in QueueFilterBar's own date input, which only
 * renders when that preset is selected.
 */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  now: Date = new Date(),
  customDate?: string
): DateRangeBounds {
  if (preset === 'all') return { from: null, to: null };

  if (preset === 'custom') {
    return customDate
      ? { from: customDate, to: customDate }
      : { from: null, to: null };
  }

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  if (preset === 'today') {
    const iso = isoDate(today);
    return { from: iso, to: iso };
  }

  if (preset === 'tomorrow') {
    const iso = isoDate(new Date(today.getTime() + 86400000));
    return { from: iso, to: iso };
  }

  if (preset === 'this_week') {
    const day = today.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(today.getTime() - diffToMonday * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    return { from: isoDate(monday), to: isoDate(sunday) };
  }

  const first = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  );
  const last = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  );
  return { from: isoDate(first), to: isoDate(last) };
}
