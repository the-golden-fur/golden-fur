/**
 * Today's local date as `YYYY-MM-DD` - the shape an `<input type="date">`
 * value and its `max` attribute use. Built from the local date parts rather
 * than `toISOString()`, which is UTC and can land a day off (same reasoning
 * as formatPetAge.ts).
 */
export function todayDateKey(today: Date = new Date()): string {
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Whether a `YYYY-MM-DD` date is after today - plain string comparison is
 * correct for that zero-padded shape. Used to block a pet's date of birth
 * from being set in the future. */
export function isFutureDate(
  value: string,
  today: Date = new Date()
): boolean {
  return value > todayDateKey(today);
}
