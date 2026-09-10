import { describe, expect, it } from 'vitest';
import { deriveWeightClass } from './deriveWeightClass';

const CUTOFFS = { m_min_kg: 9.5, l_min_kg: 22, xl_min_kg: 41 };

describe('deriveWeightClass (client)', () => {
  it('classifies below the M cut-off as S', () => {
    expect(deriveWeightClass(4.2, CUTOFFS)).toBe('S');
  });

  it('treats lower bounds as inclusive', () => {
    expect(deriveWeightClass(9.5, CUTOFFS)).toBe('M');
    expect(deriveWeightClass(22, CUTOFFS)).toBe('L');
    expect(deriveWeightClass(41, CUTOFFS)).toBe('XL');
  });

  it('classifies just-below values into the lower band', () => {
    expect(deriveWeightClass(21.99, CUTOFFS)).toBe('M');
    expect(deriveWeightClass(40.99, CUTOFFS)).toBe('L');
  });
});
