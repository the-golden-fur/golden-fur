import { describe, expect, it } from 'vitest';
import {
  describeCageSizeMismatch,
  getCageSizeFit,
  isCageSizeMismatch,
} from './cageSizeFit';

describe('getCageSizeFit', () => {
  it('is a match when the cage is the same size as the pet', () => {
    expect(getCageSizeFit('L', 'L')).toBe('match');
  });

  it('is too_small when the cage is smaller than the pet', () => {
    expect(getCageSizeFit('L', 'S')).toBe('too_small');
    expect(getCageSizeFit('XL', 'L')).toBe('too_small');
  });

  it('is too_large when the cage is bigger than the pet', () => {
    expect(getCageSizeFit('S', 'M')).toBe('too_large');
    expect(getCageSizeFit('M', 'XL')).toBe('too_large');
  });

  it('is unknown when either size is missing or unrecognised', () => {
    expect(getCageSizeFit(null, 'S')).toBe('unknown');
    expect(getCageSizeFit('S', undefined)).toBe('unknown');
    expect(getCageSizeFit('Huge', 'S')).toBe('unknown');
  });
});

describe('isCageSizeMismatch', () => {
  it('is true only for too_small / too_large', () => {
    expect(isCageSizeMismatch('too_small')).toBe(true);
    expect(isCageSizeMismatch('too_large')).toBe(true);
    expect(isCageSizeMismatch('match')).toBe(false);
    expect(isCageSizeMismatch('unknown')).toBe(false);
  });
});

describe('describeCageSizeMismatch', () => {
  it('names the cage, both sizes, and why it does not fit', () => {
    expect(describeCageSizeMismatch('too_small', 'L', 'Makati-S-01', 'S')).toBe(
      'Cage Makati-S-01 is size S, but this pet is size L. The cage is too small for this pet.'
    );
    expect(describeCageSizeMismatch('too_large', 'S', 'Makati-L-01', 'L')).toBe(
      'Cage Makati-L-01 is size L, but this pet is size S. The cage is larger than this pet needs.'
    );
  });
});
