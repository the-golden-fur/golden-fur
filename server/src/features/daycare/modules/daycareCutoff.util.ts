/** How long before the branch's closing time Daycare stops taking pets in -
 * the latest a session can start, so even a 2-hour stay ends by closing. */
export const DAYCARE_LAST_START_BEFORE_CLOSE_MINUTES = 120;

/**
 * The time of day ("HH:MM", branch-local) after which a branch no longer
 * checks pets in to Daycare: two hours before that day's closing time, as
 * set in the branch's operating hours (Superadmin > Branches). One place for
 * the rule, shared by the two sides that must agree on it: check-in itself
 * (daycareCheckIn.service.ts) and booking (availability.service.ts), which
 * must not offer or accept a Daycare session that starts too late to ever be
 * checked in. Its own module (rather than a daycareCheckIn.service.ts export)
 * because that service already imports booking.service.ts.
 *
 * Replaces the old fixed cutoff (branches.daycare_checkin_cutoff, and a
 * hard-coded 4 PM for Makati), which ignored the closing time - a branch open
 * until 9 PM still stopped Daycare at 4. That column is no longer read.
 */
export function resolveDaycareCutoffTime(closeTime: string): string {
  const [hour, minute] = closeTime.split(':').map(Number);
  const cutoffMinutes = Math.max(
    0,
    hour * 60 + minute - DAYCARE_LAST_START_BEFORE_CLOSE_MINUTES
  );

  return `${String(Math.floor(cutoffMinutes / 60)).padStart(2, '0')}:${String(
    cutoffMinutes % 60
  ).padStart(2, '0')}`;
}

/** "16:00" or "16:00:00" -> "4:00 PM". */
export function formatDaycareCutoff(cutoffTime: string): string {
  const [hour, minute] = cutoffTime.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}
