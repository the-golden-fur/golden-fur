import { describe, expect, it } from 'vitest';
import {
  currentGoalMonth,
  formatGoalMonth,
  isGoalMonth,
  shiftGoalMonth,
} from './goalMonth';

describe('goalMonth', () => {
  it('formats the current month as YYYY-MM', () => {
    expect(currentGoalMonth(new Date(2026, 2, 15))).toBe('2026-03');
  });

  it('shifts across a year boundary in both directions', () => {
    expect(shiftGoalMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftGoalMonth('2026-12', 1)).toBe('2027-01');
  });

  it('labels a month for a column heading', () => {
    expect(formatGoalMonth('2026-10')).toBe('Oct 2026');
  });

  it('only accepts a real YYYY-MM', () => {
    expect(isGoalMonth('2026-10')).toBe(true);
    expect(isGoalMonth('2026-13')).toBe(false);
    expect(isGoalMonth('')).toBe(false);
  });
});
