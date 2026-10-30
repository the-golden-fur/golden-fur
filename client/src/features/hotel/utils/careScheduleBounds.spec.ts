import { describe, expect, it } from 'vitest';
import {
  clampTime,
  getVisitTimeBounds,
  isTimeWithinBounds,
} from './careScheduleBounds';

const localIso = (day: number, hour: number, minute = 0) =>
  new Date(2026, 7, day, hour, minute).toISOString();

describe('getVisitTimeBounds', () => {
  it('runs from the start to one minute before the end', () => {
    expect(getVisitTimeBounds(localIso(3, 9), localIso(3, 13))).toEqual({
      min: '09:00',
      max: '12:59',
    });
  });

  it('has no real upper limit when the visit runs past midnight', () => {
    expect(getVisitTimeBounds(localIso(3, 21), localIso(4, 1))).toEqual({
      min: '21:00',
      max: '23:59',
    });
  });
});

describe('isTimeWithinBounds', () => {
  const bounds = { min: '09:00', max: '12:59' };

  it.each([
    ['09:00', true],
    ['12:59', true],
    ['08:59', false],
    ['13:00', false],
    ['', false],
  ])('%s -> %s', (time, expected) => {
    expect(isTimeWithinBounds(time, bounds)).toBe(expected);
  });
});

describe('clampTime', () => {
  const bounds = { min: '09:00', max: '12:59' };

  it('moves a time into the window and leaves one inside it alone', () => {
    expect(clampTime('08:00', bounds)).toBe('09:00');
    expect(clampTime('14:00', bounds)).toBe('12:59');
    expect(clampTime('10:30', bounds)).toBe('10:30');
  });
});
