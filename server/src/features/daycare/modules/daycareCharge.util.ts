/**
 * The Daycare hourly rule, in one place: one hour or less is the flat
 * first-hour fee; anything longer adds the succeeding-hour fee for every
 * further hour, a partial hour counting as a whole one (1h10m = 2 billable
 * hours).
 *
 * Shared by the two places that price a Daycare stay - the booking itself
 * (booking.service.ts, from the hours that were booked) and checkout
 * (daycareBilling.service.ts, from the time the pet actually stayed) - so
 * the two can never drift apart. Its own module rather than a
 * daycareBilling.service.ts export because that service already imports
 * booking.service.ts.
 */
export function daycareHourlyCharge(
  elapsedMinutes: number,
  firstHourFee: number,
  succeedingHourFee: number
): { succeedingHours: number; charge: number } {
  const succeedingHours =
    elapsedMinutes <= 60 ? 0 : Math.ceil((elapsedMinutes - 60) / 60);

  return {
    succeedingHours,
    charge: firstHourFee + succeedingHours * succeedingHourFee,
  };
}
