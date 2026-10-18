import { describe, expect, it } from 'vitest';
import { isFutureDate, todayDateKey } from './isFutureDate';

const TODAY = new Date(2026, 9, 18, 23, 30); // 2026-10-18, late local evening

describe('todayDateKey', () => {
  it('returns the local date as zero-padded YYYY-MM-DD', () => {
    expect(todayDateKey(TODAY)).toBe('2026-10-18');
    expect(todayDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('isFutureDate', () => {
  it('treats today and past dates as not in the future', () => {
    expect(isFutureDate('2026-10-18', TODAY)).toBe(false);
    expect(isFutureDate('2026-10-17', TODAY)).toBe(false);
    expect(isFutureDate('2020-02-29', TODAY)).toBe(false);
  });

  it('flags any date after today', () => {
    expect(isFutureDate('2026-10-19', TODAY)).toBe(true);
    expect(isFutureDate('2027-01-01', TODAY)).toBe(true);
  });
});
