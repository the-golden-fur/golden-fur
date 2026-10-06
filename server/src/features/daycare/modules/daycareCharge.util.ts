/**
 * The Daycare hourly rule, in one place: one hour or less is the flat
 * first-hour fee; anything longer adds the succeeding-hour fee for every
 * further hour, a partial hour counting as a whole one (1h10m = 2 billable
 * hours).
 *
 * `graceMinutes` (pay at checkout only - policy_configurations
 * .pay_at_checkout_grace_minutes) is how far past a full hour a stay may run
 * before that next hour is billed: with 10, 2h08m is 2 billable hours and
 * 2h11m is 3. Every other caller leaves it at 0.
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
  succeedingHourFee: number,
  graceMinutes: number = 0
): { succeedingHours: number; charge: number } {
  const succeedingHours = Math.max(
    0,
    Math.ceil((elapsedMinutes - 60 - graceMinutes) / 60)
  );

  return {
    succeedingHours,
    charge: firstHourFee + succeedingHours * succeedingHourFee,
  };
}

/** Flat fee for each hour a booked Daycare pet stays past its booked end
 * time - billed as its own line instead of the normal hourly rate. */
export const DAYCARE_OVERDUE_FEE_PER_HOUR = 50;

/** How late a pickup may be before the overdue fee starts at all. */
export const DAYCARE_OVERDUE_GRACE_MINUTES = 15;

/**
 * The Daycare overdue rule, in one place: a pickup up to the grace period
 * late is free; past that, every hour since the booked end time is the flat
 * overdue fee, a partial hour counting as a whole one (16 min late = 1
 * overdue hour, 61 min late = 2). The grace period is not deducted once it
 * has been exceeded.
 */
export function daycareOverdueCharge(overdueMinutes: number): {
  overdueHours: number;
  charge: number;
} {
  const overdueHours =
    overdueMinutes <= DAYCARE_OVERDUE_GRACE_MINUTES
      ? 0
      : Math.ceil(overdueMinutes / 60);

  return {
    overdueHours,
    charge: overdueHours * DAYCARE_OVERDUE_FEE_PER_HOUR,
  };
}
