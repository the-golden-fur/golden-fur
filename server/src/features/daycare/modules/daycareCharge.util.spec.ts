import { describe, expect, it } from 'vitest';
import { daycareHourlyCharge } from './daycareCharge.util.ts';

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
});
