import { describe, expect, it } from 'vitest';
import {
  isWithinWeightLimits,
  weightLimitMessage,
  weightLimitsFrom,
} from './petWeightLimits';

const LIMITS = { min_weight_kg: 0.1, max_weight_kg: 156 };

describe('petWeightLimits', () => {
  it('accepts both ends and anything between', () => {
    expect(isWithinWeightLimits(0.1, LIMITS)).toBe(true);
    expect(isWithinWeightLimits(156, LIMITS)).toBe(true);
    expect(isWithinWeightLimits(156.01, LIMITS)).toBe(false);
  });

  it('says "Invalid weight" with the allowed range, in the unit being typed', () => {
    expect(weightLimitMessage(9998678, LIMITS, 'kg')).toBe(
      'Invalid weight - enter between 0.1 kg and 156 kg.'
    );
    expect(weightLimitMessage(0.05, LIMITS, 'lbs')).toBe(
      'Invalid weight - enter between 0.2 lb (0.1 kg) and 343.9 lb (156 kg).'
    );
    expect(weightLimitMessage(15, LIMITS, 'kg')).toBeNull();
  });

  it('flags zero, negative and non-numbers as invalid too', () => {
    for (const kg of [0, -5, Number.NaN]) {
      expect(weightLimitMessage(kg, LIMITS, 'kg')).toMatch(/^Invalid weight/);
    }
  });

  it('falls back to the default range when the config has no limits', () => {
    expect(weightLimitsFrom(null)).toEqual(LIMITS);
    expect(weightLimitsFrom({ min_weight_kg: 0.1 })).toEqual(LIMITS);
    expect(
      weightLimitsFrom({
        min_weight_kg: '0.10',
        max_weight_kg: '156.00',
      } as never)
    ).toEqual(LIMITS);
  });
});
