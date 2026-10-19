import { describe, expect, it } from 'vitest';
import { cageOverrideCloseValidator } from './hotel.validator.ts';

describe('cageOverrideCloseValidator (front-desk cage override)', () => {
  it('accepts whole minutes from 5 up to a full day', () => {
    expect(cageOverrideCloseValidator.safeParse({ minutes: 5 }).success).toBe(
      true
    );
    expect(
      cageOverrideCloseValidator.safeParse({ minutes: 1440 }).success
    ).toBe(true);
  });

  it('rejects too short, too long, fractional, or extra fields', () => {
    for (const body of [
      { minutes: 4 },
      { minutes: 1441 },
      { minutes: 30.5 },
      { minutes: 30, reason: 'x' },
      {},
    ]) {
      expect(cageOverrideCloseValidator.safeParse(body).success).toBe(false);
    }
  });
});
