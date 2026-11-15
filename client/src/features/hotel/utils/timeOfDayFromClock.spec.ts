import { describe, expect, it } from 'vitest';
import { mealTimeFromClock, partOfDayFromClock } from './timeOfDayFromClock';

describe('mealTimeFromClock', () => {
  it.each([
    ['00:00', 'Morning'],
    ['10:59', 'Morning'],
    ['11:00', 'Noon'],
    ['12:59', 'Noon'],
    ['13:00', 'Afternoon'],
    ['16:59', 'Afternoon'],
    ['17:00', 'Evening'],
    ['23:59', 'Evening'],
  ])('buckets %s as %s', (time, expected) => {
    expect(mealTimeFromClock(time)).toBe(expected);
  });
});

describe('partOfDayFromClock', () => {
  it.each([
    ['00:00', 'Morning'],
    ['11:59', 'Morning'],
    ['12:00', 'Afternoon'],
    ['16:59', 'Afternoon'],
    ['17:00', 'Evening'],
    ['23:59', 'Evening'],
  ])('buckets %s as %s', (time, expected) => {
    expect(partOfDayFromClock(time)).toBe(expected);
  });
});
