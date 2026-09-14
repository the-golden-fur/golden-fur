import { describe, expect, it } from 'vitest';
import {
  formatWeight,
  kgToLbs,
  lbsToKg,
  toCanonicalKg,
  toDisplayValue,
} from './petWeight';

describe('petWeight', () => {
  it('converts between kg and lbs', () => {
    expect(lbsToKg(10)).toBeCloseTo(4.5359237, 6);
    expect(kgToLbs(10)).toBeCloseTo(22.0462262, 6);
  });

  it('round-trips kg -> lbs -> kg without drifting the stored value', () => {
    const kg = 27.6;
    const back = toCanonicalKg(toDisplayValue(kg, 'lbs'), 'lbs');
    expect(back).toBeCloseTo(kg, 1);
  });

  it('toCanonicalKg leaves a kg entry alone (2 dp)', () => {
    expect(toCanonicalKg(14.239, 'kg')).toBe(14.24);
  });

  it('toCanonicalKg converts an lbs entry', () => {
    expect(toCanonicalKg(100, 'lbs')).toBeCloseTo(45.36, 2);
  });

  it('formats a labelled weight in the chosen unit, 1 dp', () => {
    expect(formatWeight(20.44, 'kg')).toBe('20.4 kg');
    expect(formatWeight(20, 'lbs')).toBe('44.1 lb');
  });
});
