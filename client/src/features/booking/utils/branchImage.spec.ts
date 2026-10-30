import { describe, expect, it } from 'vitest';
import { branchImageFor } from './branchImage';

describe('branchImageFor', () => {
  it('gives each branch its own photo, matched case-insensitively', () => {
    expect(branchImageFor('Makati')).toMatch(/makatigodenfur/);
    expect(branchImageFor('golden fur SOUTHWOODS')).toMatch(
      /southwodosgoldenfur/
    );
  });

  it('falls back to the general photo for a branch without one', () => {
    expect(branchImageFor('Alabang')).toMatch(/goldenfurbg/);
  });
});
