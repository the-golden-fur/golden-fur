export type MealTime = 'Morning' | 'Afternoon' | 'Evening';

/** Meal times are an enum, not a clock time (see MEAL_TIMES in
 * CustomerBookingFlowPage.tsx) - this is the fixed clock-time convention
 * used to judge whether a meal falls before check-in / after checkout on
 * the edge days of a stay. */
export const MEAL_TIME_WINDOWS: Record<MealTime, { start: string; end: string }> = {
  Morning: { start: '06:00', end: '10:00' },
  Afternoon: { start: '11:00', end: '16:00' },
  Evening: { start: '17:00', end: '21:00' },
};

function toTimeOfDay(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

/** Check-in time-of-day, "HH:MM" - the relevant bound for day 1. */
export function getDayOneMinTime(scheduledStart: string): string {
  return toTimeOfDay(scheduledStart);
}

/** Checkout time-of-day, "HH:MM" - the relevant bound for the last day. */
export function getLastDayMaxTime(scheduledEnd: string): string {
  return toTimeOfDay(scheduledEnd);
}

/** A meal is "not applicable on day 1" if its window has already ended by
 * the time the pet checks in (e.g. checking in at 11am means Morning
 * feeding has already passed). */
export function isMealApplicableOnDayOne(
  mealTime: MealTime,
  checkInTime: string
): boolean {
  return MEAL_TIME_WINDOWS[mealTime].end >= checkInTime;
}

/** A meal is "not applicable on the last day" if its window hasn't started
 * yet by checkout time (e.g. checking out at 10am means Evening feeding
 * never happens that day). */
export function isMealApplicableOnLastDay(
  mealTime: MealTime,
  checkOutTime: string
): boolean {
  return MEAL_TIME_WINDOWS[mealTime].start <= checkOutTime;
}
