import { describe, expect, it } from 'vitest';
import { overdueDuration } from './overdueDuration';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// 2026-10-14 14:00 Manila (06:00 UTC).
const EXPECTED = Date.parse('2026-10-14T06:00:00.000Z');

describe('overdueDuration', () => {
  it('is nothing before the expected checkout', () => {
    expect(overdueDuration(EXPECTED, EXPECTED - MINUTE, null)).toEqual({
      hours: 0,
      nights: 0,
    });
  });

  it('counts no hours within the grace period', () => {
    expect(overdueDuration(EXPECTED, EXPECTED + 15 * MINUTE, 15).hours).toBe(0);
  });

  it('counts every started hour once past the grace period', () => {
    expect(overdueDuration(EXPECTED, EXPECTED + 16 * MINUTE, 15).hours).toBe(1);
    expect(overdueDuration(EXPECTED, EXPECTED + HOUR, 15).hours).toBe(1);
    expect(overdueDuration(EXPECTED, EXPECTED + 61 * MINUTE, 15).hours).toBe(2);
  });

  it('treats a missing grace period as none', () => {
    expect(overdueDuration(EXPECTED, EXPECTED + MINUTE, null).hours).toBe(1);
  });

  it('counts a night for each Manila midnight passed', () => {
    // 23:30 -> 00:10 Manila the next day.
    const lateEvening = Date.parse('2026-10-14T15:30:00.000Z');
    expect(
      overdueDuration(lateEvening, lateEvening + 40 * MINUTE, null)
    ).toEqual({ hours: 1, nights: 1 });

    // 14:00 -> 10:00 Manila two days later.
    expect(overdueDuration(EXPECTED, EXPECTED + 44 * HOUR, null)).toEqual({
      hours: 44,
      nights: 2,
    });
  });

  it('counts no night while still the same Manila day', () => {
    // 14:00 -> 23:00 Manila.
    expect(overdueDuration(EXPECTED, EXPECTED + 9 * HOUR, null).nights).toBe(0);
  });
});
