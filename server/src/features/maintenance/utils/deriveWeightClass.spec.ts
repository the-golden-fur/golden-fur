import { describe, expect, it } from 'vitest';
import { deriveWeightClass } from './deriveWeightClass.ts';

const CUTOFFS = { m_min_kg: 9.5, l_min_kg: 22, xl_min_kg: 41 };

describe('deriveWeightClass', () => {
  it('classifies a weight below the M cut-off as S', () => {
    expect(deriveWeightClass(4.2, CUTOFFS)).toBe('S');
    expect(deriveWeightClass(0.1, CUTOFFS)).toBe('S');
  });

  it('treats each lower bound as inclusive', () => {
    expect(deriveWeightClass(9.5, CUTOFFS)).toBe('M');
    expect(deriveWeightClass(22, CUTOFFS)).toBe('L');
    expect(deriveWeightClass(41, CUTOFFS)).toBe('XL');
  });

  it('classifies weights just below a cut-off in the lower band', () => {
    expect(deriveWeightClass(9.49, CUTOFFS)).toBe('S');
    expect(deriveWeightClass(21.99, CUTOFFS)).toBe('M');
    expect(deriveWeightClass(40.99, CUTOFFS)).toBe('L');
  });

  it('classifies a very heavy pet as XL', () => {
    expect(deriveWeightClass(150, CUTOFFS)).toBe('XL');
  });

  it('honours custom cut-offs', () => {
    const custom = { m_min_kg: 5, l_min_kg: 10, xl_min_kg: 15 };
    expect(deriveWeightClass(4, custom)).toBe('S');
    expect(deriveWeightClass(7, custom)).toBe('M');
    expect(deriveWeightClass(12, custom)).toBe('L');
    expect(deriveWeightClass(20, custom)).toBe('XL');
  });
});
