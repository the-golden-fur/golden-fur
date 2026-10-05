import { describe, expect, it } from 'vitest';
import {
  daycareHourlyCharge,
  daycareOverdueCharge,
} from './daycareCharge.util.ts';

describe('daycareHourlyCharge', () => {
  it('is the flat first-hour fee for an hour or less', () => {
    expect(daycareHourlyCharge(30, 100, 50)).toEqual({
      succeedingHours: 0,
      charge: 100,
    });
    expect(daycareHourlyCharge(60, 100, 50).charge).toBe(100);
  });

  it('adds the succeeding-hour fee for every further hour', () => {
    expect(daycareHourlyCharge(120, 100, 50)).toEqual({
      succeedingHours: 1,
      charge: 150,
    });
    expect(daycareHourlyCharge(240, 100, 50)).toEqual({
      succeedingHours: 3,
      charge: 250,
    });
  });

  it('counts a partial succeeding hour as a whole one', () => {
    expect(daycareHourlyCharge(70, 100, 50).charge).toBe(150);
    expect(daycareHourlyCharge(135, 100, 50).charge).toBe(200);
  });

  it("uses the service's own fees", () => {
    expect(daycareHourlyCharge(180, 200, 75).charge).toBe(350);
  });

  it('does not bill another hour within the grace period past the hour', () => {
    expect(daycareHourlyCharge(70, 100, 50, 10).charge).toBe(100);
    expect(daycareHourlyCharge(71, 100, 50, 10).charge).toBe(150);
    expect(daycareHourlyCharge(128, 100, 50, 10)).toEqual({
      succeedingHours: 1,
      charge: 150,
    });
    expect(daycareHourlyCharge(131, 100, 50, 10)).toEqual({
      succeedingHours: 2,
      charge: 200,
    });
  });

  it('never bills fewer than zero succeeding hours with a grace period', () => {
    expect(daycareHourlyCharge(30, 100, 50, 10)).toEqual({
      succeedingHours: 0,
      charge: 100,
    });
  });
});

describe('daycareOverdueCharge', () => {
  it('charges nothing on time or within the 15-minute grace period', () => {
    expect(daycareOverdueCharge(0)).toEqual({ overdueHours: 0, charge: 0 });
    expect(daycareOverdueCharge(-30).charge).toBe(0);
    expect(daycareOverdueCharge(15).charge).toBe(0);
  });

  it('charges a flat ₱50 for every started hour once past the grace period', () => {
    expect(daycareOverdueCharge(16)).toEqual({ overdueHours: 1, charge: 50 });
    expect(daycareOverdueCharge(60).charge).toBe(50);
    expect(daycareOverdueCharge(61)).toEqual({ overdueHours: 2, charge: 100 });
    expect(daycareOverdueCharge(180).charge).toBe(150);
  });
});
