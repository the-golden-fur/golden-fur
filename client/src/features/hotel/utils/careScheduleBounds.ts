export type MealTime = 'Morning' | 'Noon' | 'Afternoon' | 'Evening';

/** Meal times are an enum, not a clock time (see MEAL_TIMES in
 * CustomerBookingFlowPage.tsx) - this is the fixed clock-time convention
 * used to judge whether a meal falls before check-in / after checkout on
 * the edge days of a stay. */
export const MEAL_TIME_WINDOWS: Record<
  MealTime,
  { start: string; end: string }
> = {
  Morning: { start: '06:00', end: '10:00' },
  Noon: { start: '10:00', end: '13:00' },
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

export interface VisitTimeBounds {
  /** "HH:MM", the earliest allowed start. */
  min: string;
  /** "HH:MM", the latest allowed start. */
  max: string;
}

/** Which care times fit a Daycare visit: from its start up to, but not
 * including, its end - the pet is leaving at the end time. A late walk-in can
 * run past midnight, where a same-day max would fall before min, so that case
 * has no real upper limit. */
export function getVisitTimeBounds(
  scheduledStart: string,
  scheduledEnd: string
): VisitTimeBounds {
  const lastMinute = new Date(new Date(scheduledEnd).getTime() - 60000);
  const endsSameDay =
    new Date(scheduledStart).toDateString() === lastMinute.toDateString();

  return {
    min: toTimeOfDay(scheduledStart),
    max: endsSameDay ? toTimeOfDay(lastMinute.toISOString()) : '23:59',
  };
}

/** "HH:MM" strings compare correctly as plain strings. */
export function isTimeWithinBounds(
  time: string,
  { min, max }: VisitTimeBounds
): boolean {
  return time >= min && time <= max;
}

export function clampTime(time: string, { min, max }: VisitTimeBounds): string {
  if (time < min) return min;
  return time > max ? max : time;
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
