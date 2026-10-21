import { describe, expect, it } from 'vitest';
import {
  matchingMonth,
  matchingPreset,
  monthPeriod,
  presetPeriod,
} from './trendsPeriod';

// Local time, like the date inputs - 21 Oct 2026.
const NOW = new Date(2026, 9, 21, 10, 0, 0);

describe('trendsPeriod', () => {
  it('builds each preset range up to today', () => {
    expect(presetPeriod('this-month', NOW)).toEqual({
      from: '2026-10-01',
      to: '2026-10-21',
    });
    expect(presetPeriod('last-30-days', NOW)).toEqual({
      from: '2026-09-22',
      to: '2026-10-21',
    });
    expect(presetPeriod('this-year', NOW)).toEqual({
      from: '2026-01-01',
      to: '2026-10-21',
    });
  });

  it('covers a whole month, including February in a non-leap year', () => {
    expect(monthPeriod('2026-02')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(monthPeriod('2028-02').to).toBe('2028-02-29');
    expect(monthPeriod('2026-12').to).toBe('2026-12-31');
  });

  it('recognises a range that matches a preset or a whole month', () => {
    expect(
      matchingPreset({ from: '2026-10-01', to: '2026-10-21' }, NOW)
    ).toBe('this-month');
    expect(
      matchingPreset({ from: '2026-10-02', to: '2026-10-21' }, NOW)
    ).toBeNull();
    expect(matchingMonth({ from: '2026-02-01', to: '2026-02-28' })).toBe(
      '2026-02'
    );
    expect(matchingMonth({ from: '2026-02-01', to: '2026-02-27' })).toBeNull();
  });
});
