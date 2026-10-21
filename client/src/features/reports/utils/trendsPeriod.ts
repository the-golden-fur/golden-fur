import { currentReportDay, shiftReportDay } from './reportDay';

/** A Trends date range - inclusive `YYYY-MM-DD` report days. */
export interface TrendsPeriod {
  from: string;
  to: string;
}

export type TrendsPreset = 'this-month' | 'last-30-days' | 'this-year';

export const TRENDS_PRESETS: { value: TrendsPreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'this-year', label: 'This year' },
];

export function presetPeriod(
  preset: TrendsPreset,
  now = new Date()
): TrendsPeriod {
  const today = currentReportDay(now);

  switch (preset) {
    case 'this-month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'last-30-days':
      return { from: shiftReportDay(today, -29), to: today };
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** `monthPeriod('2026-02')` -> `{ from: '2026-02-01', to: '2026-02-28' }`. */
export function monthPeriod(month: string): TrendsPeriod {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    from: `${month}-01`,
    // Day 0 of the next month is this month's last day.
    to: currentReportDay(new Date(year, monthNumber, 0)),
  };
}

/** The preset a range matches exactly, if any - so the matching button
 * shows as selected after the range is picked some other way. */
export function matchingPreset(
  period: TrendsPeriod,
  now = new Date()
): TrendsPreset | null {
  return (
    TRENDS_PRESETS.find(({ value }) => {
      const candidate = presetPeriod(value, now);
      return candidate.from === period.from && candidate.to === period.to;
    })?.value ?? null
  );
}

/** The `YYYY-MM` a range covers exactly (first to last day), if any. */
export function matchingMonth(period: TrendsPeriod): string | null {
  const month = period.from.slice(0, 7);
  const whole = monthPeriod(month);
  return whole.from === period.from && whole.to === period.to ? month : null;
}
