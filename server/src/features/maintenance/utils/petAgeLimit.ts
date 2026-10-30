/**
 * The oldest pet on record (Creme Puff, a cat) lived to 38 - the hard
 * ceiling for pet_age_configuration.max_age_years. Admins can lower the
 * limit but never raise it past this; the DB CHECK on that table enforces the
 * same number.
 */
export const RECORD_MAX_PET_AGE_YEARS = 38;

/**
 * The earliest `YYYY-MM-DD` date of birth a pet may have so it is at most
 * `maxAgeYears` old on `today` (also `YYYY-MM-DD`). A pet born exactly
 * `maxAgeYears` ago today is allowed; a day earlier is not. A Feb 29 today
 * maps to Feb 28 in a non-leap target year rather than rolling into March.
 *
 * The client has its own copy of this exact formula
 * (client/src/features/maintenance/utils/petAgeLimit.ts) - no shared module
 * between the two builds, so keep the two in sync if this changes.
 */
export function earliestDateOfBirth(
  today: string,
  maxAgeYears: number
): string {
  const [year, month, day] = today.split('-').map(Number);
  const targetYear = year - maxAgeYears;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();

  return [
    String(targetYear).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(Math.min(day, lastDayOfMonth)).padStart(2, '0'),
  ].join('-');
}

/** Whether a `YYYY-MM-DD` date of birth makes the pet older than
 * `maxAgeYears` on `today`. Plain string comparison is correct for that
 * zero-padded shape. */
export function isOlderThanAgeLimit(
  dateOfBirth: string,
  today: string,
  maxAgeYears: number
): boolean {
  return dateOfBirth < earliestDateOfBirth(today, maxAgeYears);
}
