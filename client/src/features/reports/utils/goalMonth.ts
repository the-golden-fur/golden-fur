/** Goal months travel as `YYYY-MM` - what GET /reports/goals takes and what
 * an `<input type="month">` reads and writes. */

export function currentGoalMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** `shiftGoalMonth('2026-01', -1)` -> `'2025-12'`. */
export function shiftGoalMonth(month: string, by: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return currentGoalMonth(new Date(year, monthNumber - 1 + by, 1));
}

/** `'2026-10'` -> `'Oct 2026'`. */
export function formatGoalMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  });
}

export function isGoalMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
