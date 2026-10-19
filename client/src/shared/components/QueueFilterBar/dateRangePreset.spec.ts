import { describe, expect, it } from 'vitest';
import {
  countByDatePreset,
  countsFetchRange,
  resolveDateRangePreset,
} from './dateRangePreset';

// A Wednesday, deliberately mid-week/mid-month so week/month boundaries are
// unambiguous either direction.
const WEDNESDAY = new Date('2026-07-22T10:00:00.000Z');

describe('resolveDateRangePreset', () => {
  it("'today' returns the same from/to date", () => {
    expect(resolveDateRangePreset('today', WEDNESDAY)).toEqual({
      from: '2026-07-22',
      to: '2026-07-22',
    });
  });

  it("'tomorrow' returns the day after 'now'", () => {
    expect(resolveDateRangePreset('tomorrow', WEDNESDAY)).toEqual({
      from: '2026-07-23',
      to: '2026-07-23',
    });
  });

  it("'tomorrow' rolls over correctly at a month boundary", () => {
    const lastDayOfMonth = new Date('2026-07-31T10:00:00.000Z');
    expect(resolveDateRangePreset('tomorrow', lastDayOfMonth)).toEqual({
      from: '2026-08-01',
      to: '2026-08-01',
    });
  });

  it("'this_week' is a rolling 7-day window starting today (today through today+6)", () => {
    expect(resolveDateRangePreset('this_week', WEDNESDAY)).toEqual({
      from: '2026-07-22',
      to: '2026-07-28',
    });
  });

  it("'this_week' always includes tomorrow, even when 'now' is a Sunday (regression: a fixed Monday-Sunday week used to end on Sunday itself, excluding the very next day)", () => {
    const sunday = new Date('2026-07-26T23:00:00.000Z');
    const tomorrow = resolveDateRangePreset('tomorrow', sunday);
    const thisWeek = resolveDateRangePreset('this_week', sunday);

    expect(thisWeek).toEqual({ from: '2026-07-26', to: '2026-08-01' });
    expect(tomorrow.from! >= thisWeek.from!).toBe(true);
    expect(tomorrow.from! <= thisWeek.to!).toBe(true);
  });

  it("'this_week' rolls over a month boundary correctly", () => {
    const monday = new Date('2026-07-27T00:30:00.000Z');
    expect(resolveDateRangePreset('this_week', monday)).toEqual({
      from: '2026-07-27',
      to: '2026-08-02',
    });
  });

  it("'this_month' spans the full calendar month", () => {
    expect(resolveDateRangePreset('this_month', WEDNESDAY)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it("'this_month' handles a short month correctly", () => {
    const february = new Date('2026-02-10T00:00:00.000Z');
    expect(resolveDateRangePreset('this_month', february)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it("'all' returns unbounded null/null", () => {
    expect(resolveDateRangePreset('all', WEDNESDAY)).toEqual({
      from: null,
      to: null,
    });
  });

  it("'custom' returns the given customDate as both bounds", () => {
    expect(resolveDateRangePreset('custom', WEDNESDAY, '2026-07-24')).toEqual({
      from: '2026-07-24',
      to: '2026-07-24',
    });
  });

  it("'custom' returns unbounded null/null when no customDate is given yet", () => {
    expect(resolveDateRangePreset('custom', WEDNESDAY)).toEqual({
      from: null,
      to: null,
    });
  });
});

describe('countsFetchRange', () => {
  it('spans the 1st of the month through month end mid-month', () => {
    expect(countsFetchRange(new Date('2026-07-15T08:00:00.000Z'))).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('extends past month end when the rolling week crosses into next month', () => {
    expect(countsFetchRange(new Date('2026-07-29T08:00:00.000Z'))).toEqual({
      from: '2026-07-01',
      to: '2026-08-04',
    });
  });
});

describe('countByDatePreset', () => {
  const NOW = new Date('2026-07-15T08:00:00.000Z');

  it('counts each booking into every preset whose range contains it', () => {
    expect(
      countByDatePreset(
        [
          '2026-07-15T10:00:00.000Z', // today
          '2026-07-16T09:00:00.000Z', // tomorrow
          '2026-07-20T09:00:00.000Z', // later this week
          '2026-07-12T09:00:00.000Z', // earlier this month only
          '2026-08-02T09:00:00.000Z', // outside every preset
        ],
        NOW
      )
    ).toEqual({ today: 1, tomorrow: 1, this_week: 3, this_month: 4 });
  });

  it('returns zeros for no bookings', () => {
    expect(countByDatePreset([], NOW)).toEqual({
      today: 0,
      tomorrow: 0,
      this_week: 0,
      this_month: 0,
    });
  });
});
