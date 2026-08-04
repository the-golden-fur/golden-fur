/** One YYYY-MM-DD entry per night of a Hotel stay, starting at the check-in
 * date - shared by the booking wizard's per-night Care Instructions editor
 * and the (read-only) booking details page, so both derive the same tab
 * list from the same two inputs instead of duplicating the date math. */
export function getHotelNightDates(
  checkInDateIso: string,
  nights: number
): string[] {
  const start = new Date(`${checkInDateIso.slice(0, 10)}T00:00:00Z`);
  const dates: string[] = [];

  for (let i = 0; i < nights; i++) {
    const next = new Date(start);
    next.setUTCDate(next.getUTCDate() + i);
    dates.push(next.toISOString().slice(0, 10));
  }

  return dates;
}
