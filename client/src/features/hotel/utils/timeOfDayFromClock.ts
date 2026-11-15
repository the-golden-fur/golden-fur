import type { MealTime, PartOfDay } from '../hotel.types.ts';

/**
 * Buckets a literal "HH:MM" into Hotel Feeding's 4-value MealTime enum, for
 * the read-only "time of day" label shown when a Feeding row is in
 * specific-time mode. Mirrors careInstructions.service.ts's server-only
 * bucketTimeOfDay (not importable from the client) boundary-for-boundary:
 * Morning <11:00, Noon 11:00-12:59, Afternoon 13:00-16:59, Evening >=17:00.
 */
export function mealTimeFromClock(time: string): MealTime {
  const hour = Number(time.split(':')[0]);
  if (hour < 11) return 'Morning';
  if (hour < 13) return 'Noon';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/**
 * Buckets a literal "HH:MM" into Walking/Playtime's 3-value PartOfDay enum.
 * Mirrors HotelCheckInPanel.tsx's private partOfDayFromTime (not exported,
 * not reusable across that unrelated feature boundary) boundary-for-
 * boundary: Morning <12:00, Afternoon 12:00-16:59, Evening >=17:00.
 */
export function partOfDayFromClock(time: string): PartOfDay {
  const hour = Number(time.split(':')[0]);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}
