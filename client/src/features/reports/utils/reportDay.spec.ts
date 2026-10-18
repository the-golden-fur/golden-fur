import { describe, expect, it } from 'vitest';
import {
  currentReportDay,
  formatReportDay,
  isReportDay,
  shiftReportDay,
} from './reportDay';

describe('reportDay', () => {
  it('currentReportDay uses the local date, zero-padded', () => {
    // 00:30 local - a UTC-based date would still be the 4th east of UTC.
    expect(currentReportDay(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });

  it('shiftReportDay rolls over months and years', () => {
    expect(shiftReportDay('2026-10-18', -1)).toBe('2026-10-17');
    expect(shiftReportDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftReportDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formatReportDay reads as a short weekday + date', () => {
    const label = formatReportDay('2026-10-18');
    expect(label).toMatch(/^Sun/);
    expect(label).toMatch(/Oct/);
    expect(label).toMatch(/18/);
    expect(label).toMatch(/2026/);
    expect(formatReportDay('2026-10-18', { withYear: false })).not.toMatch(
      /2026/
    );
  });

  it('isReportDay accepts only YYYY-MM-DD', () => {
    expect(isReportDay('2026-10-18')).toBe(true);
    expect(isReportDay('')).toBe(false);
    expect(isReportDay('2026-13-01')).toBe(false);
  });
});
