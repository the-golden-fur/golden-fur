/** Report days travel as `YYYY-MM-DD` - what GET /reports/dsr takes and what
 * an `<input type="date">` reads and writes. Built from local date parts,
 * never `toISOString()`, which is UTC and lands on yesterday before 08:00 in
 * Manila. The day-level counterpart of goalMonth.ts. */

export function currentReportDay(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** `shiftReportDay('2026-03-01', -1)` -> `'2026-02-28'`. */
export function shiftReportDay(day: string, by: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return currentReportDay(new Date(year, month - 1, date + by));
}

/** `'2026-10-18'` -> `'Sun, 18 Oct 2026'`; `{ withYear: false }` drops the
 * year for compact labels. */
export function formatReportDay(
  day: string,
  { withYear = true }: { withYear?: boolean } = {}
): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('en-PH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function isReportDay(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}
