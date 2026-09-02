/**
 * Account credit expires per **calendar day** in the business's timezone
 * (Asia/Manila, UTC+8, no DST - the zone every branch uses), not per exact
 * second. Two lots issued hours apart on the same day therefore expire
 * together, and "expires Oct 1" lines up with "N days left" no matter the
 * time of issuance. Both `rolling` and `fixed_date` modes stamp a lot's
 * expires_at to the end of its Manila day.
 */

const MANILA_TZ = 'Asia/Manila';
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" for the Manila calendar day an instant falls on. */
export function manilaDayKey(instant: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(
    new Date(instant)
  );
}

/**
 * End of a Manila calendar day, as a UTC ISO instant - what a credit lot's
 * expires_at is stamped to. Accepts a "YYYY-MM-DD" key (from a fixed date)
 * or any instant (from a rolling `now + N days`).
 */
export function manilaEndOfDayIso(dayKeyOrInstant: string | Date): string {
  const key =
    typeof dayKeyOrInstant === 'string' && DATE_KEY.test(dayKeyOrInstant)
      ? dayKeyOrInstant
      : manilaDayKey(dayKeyOrInstant);
  // Manila is a fixed +08:00 offset, so the literal is unambiguous.
  return new Date(`${key}T23:59:59.999+08:00`).toISOString();
}
