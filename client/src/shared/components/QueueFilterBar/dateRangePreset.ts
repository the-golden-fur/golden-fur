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

/** Display label for a preset - used by pages' active-filter chip rows so
 * the chip text always matches the select's own option label. */
export function dateRangePresetLabel(preset: DateRangePreset): string {
  return (
    DATE_RANGE_PRESET_OPTIONS.find((option) => option.value === preset)
      ?.label ?? preset
  );
}

/**
 * Resolves a preset to an inclusive [from, to] date range, computed in UTC
 * calendar terms - matching the server's own day-boundary queries
 * (todayRangeUtc() in grooming.service.ts/consultation.service.ts, and
 * booking.service.ts's date-filter logic) so "Today" here lines up exactly
 * with what the backend considers today.
 *
 * Custom change: "this_week" used to be a fixed Monday-Sunday calendar
 * week containing `now`. That meant whenever `now` fell on a Sunday, the
 * computed week's own last day WAS today - tomorrow started a new week and
 * fell completely outside the range, so "This week" could show fewer
 * upcoming bookings than "Tomorrow" did (live bug report). "this_week" is
 * now a rolling 7-day window starting today (today through today+6), which
 * always includes "tomorrow" by construction, on every day of the week.
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
    const weekEnd = new Date(today.getTime() + 6 * 86400000);
    return { from: isoDate(today), to: isoDate(weekEnd) };
  }

  const first = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  );
  const last = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  );
  return { from: isoDate(first), to: isoDate(last) };
}

/** Presets the "how many bookings" summary row under QueueFilterBar counts. */
export const COUNTED_PRESETS = [
  'today',
  'tomorrow',
  'this_week',
  'this_month',
] as const;

export type CountedPreset = (typeof COUNTED_PRESETS)[number];

/**
 * One date range spanning every counted preset (the 1st of the month through
 * the later of today+6 and month end), so a single fetch can feed all four
 * counts via countByDatePreset().
 */
export function countsFetchRange(now: Date = new Date()): DateRangeBounds {
  const ranges = COUNTED_PRESETS.map((preset) =>
    resolveDateRangePreset(preset, now)
  );
  const froms = ranges.map((range) => range.from as string).sort();
  const tos = ranges.map((range) => range.to as string).sort();
  return { from: froms[0], to: tos[tos.length - 1] };
}

/**
 * Counts how many of `dates` (ISO timestamps, e.g. a booking's
 * scheduled_start) fall in each counted preset. Compares UTC calendar days,
 * the same day boundary resolveDateRangePreset() and the server use, so each
 * count matches what selecting that preset would list.
 */
export function countByDatePreset(
  dates: string[],
  now: Date = new Date()
): Record<CountedPreset, number> {
  const ranges = COUNTED_PRESETS.map(
    (preset) => [preset, resolveDateRangePreset(preset, now)] as const
  );
  const counts = Object.fromEntries(
    COUNTED_PRESETS.map((preset) => [preset, 0])
  ) as Record<CountedPreset, number>;

  for (const date of dates) {
    const day = new Date(date).toISOString().slice(0, 10);
    for (const [preset, range] of ranges) {
      if (range.from && range.to && day >= range.from && day <= range.to) {
        counts[preset] += 1;
      }
    }
  }

  return counts;
}
