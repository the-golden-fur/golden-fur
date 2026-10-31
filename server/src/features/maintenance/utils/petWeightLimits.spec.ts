import { describe, expect, it } from 'vitest';
import { isWithinWeightLimits } from './petWeightLimits.ts';

const LIMITS = { min_weight_kg: 0.1, max_weight_kg: 156 };

describe('isWithinWeightLimits', () => {
  it('accepts both ends and anything between', () => {
    for (const kg of [0.1, 15, 156]) {
      expect(isWithinWeightLimits(kg, LIMITS)).toBe(true);
    }
  });

  it('rejects anything lighter or heavier', () => {
    for (const kg of [0.05, 156.01, 1500]) {
      expect(isWithinWeightLimits(kg, LIMITS)).toBe(false);
    }
  });

  it('copes with numeric columns that arrive as strings', () => {
    expect(
      isWithinWeightLimits(200, {
        min_weight_kg: '0.10',
        max_weight_kg: '156.00',
      } as never)
    ).toBe(false);
  });

  it('uses the default range when the config has no limits (never NaN)', () => {
    expect(isWithinWeightLimits(15, {} as never)).toBe(true);
    expect(isWithinWeightLimits(200, {} as never)).toBe(false);
  });
});
