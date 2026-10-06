import { describe, expect, it } from 'vitest';
import { formatCountdown } from './formatCountdown';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatCountdown', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatCountdown(5 * MINUTE + 9 * SECOND)).toBe('05m 09s');
    expect(formatCountdown(0)).toBe('00m 00s');
  });

  it('adds hours under a day', () => {
    expect(formatCountdown(4 * HOUR + 5 * MINUTE + 9 * SECOND)).toBe(
      '4h 05m 09s'
    );
  });

  it('drops seconds once a day or more is left', () => {
    expect(formatCountdown(2 * DAY + 4 * HOUR + 5 * MINUTE + 9 * SECOND)).toBe(
      '2d 4h 05m'
    );
  });

  it('formats an overdue (negative) duration by its size', () => {
    expect(formatCountdown(-(40 * MINUTE + 5 * SECOND))).toBe('40m 05s');
  });
});
