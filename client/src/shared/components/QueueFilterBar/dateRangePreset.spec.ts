import { describe, expect, it } from 'vitest';
import { resolveDateRangePreset } from './dateRangePreset';

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

  it("'this_week' spans Monday through Sunday", () => {
    expect(resolveDateRangePreset('this_week', WEDNESDAY)).toEqual({
      from: '2026-07-20',
      to: '2026-07-26',
    });
  });

  it("'this_week' resolves correctly when 'now' is a Sunday", () => {
    const sunday = new Date('2026-07-26T23:00:00.000Z');
    expect(resolveDateRangePreset('this_week', sunday)).toEqual({
      from: '2026-07-20',
      to: '2026-07-26',
    });
  });

  it("'this_week' resolves correctly when 'now' is a Monday", () => {
    const monday = new Date('2026-07-20T00:30:00.000Z');
    expect(resolveDateRangePreset('this_week', monday)).toEqual({
      from: '2026-07-20',
      to: '2026-07-26',
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
