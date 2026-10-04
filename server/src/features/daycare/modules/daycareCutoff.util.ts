/** Fixed per Modules-Features - not read from branches.daycare_checkin_cutoff
 * even though the column exists on every branch (#62 migration note); only
 * Southwoods' cutoff is ever actually configurable. */
const MAKATI_DAYCARE_CUTOFF = '16:00:00';

/**
 * The time of day ("HH:MM:SS", branch-local) after which a branch no longer
 * checks pets in to Daycare. One place for the rule, shared by the two sides
 * that must agree on it: check-in itself (daycareCheckIn.service.ts) and
 * booking (availability.service.ts), which must not offer or accept a
 * Daycare session that starts too late to ever be checked in. Its own module
 * (rather than a daycareCheckIn.service.ts export) because that service
 * already imports booking.service.ts.
 */
export function resolveDaycareCutoffTime(branch: {
  name: string;
  daycare_checkin_cutoff: string;
}): string {
  return branch.name === 'Makati'
    ? MAKATI_DAYCARE_CUTOFF
    : branch.daycare_checkin_cutoff;
}

/** "16:00:00" -> "4:00 PM". */
export function formatDaycareCutoff(cutoffTime: string): string {
  const [hour, minute] = cutoffTime.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}
