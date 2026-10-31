import { describe, expect, it } from 'vitest';
import { earliestDateOfBirth, isOlderThanAgeLimit } from './petAgeLimit';

describe('earliestDateOfBirth', () => {
  it('subtracts the limit in whole years', () => {
    expect(earliestDateOfBirth('2026-10-30', 38)).toBe('1988-10-30');
  });

  it('clamps Feb 29 to Feb 28 in a non-leap target year', () => {
    expect(earliestDateOfBirth('2028-02-29', 1)).toBe('2027-02-28');
  });

  it('keeps Feb 29 when the target year is also a leap year', () => {
    expect(earliestDateOfBirth('2028-02-29', 4)).toBe('2024-02-29');
  });
});

describe('isOlderThanAgeLimit', () => {
  it('allows a pet exactly at the limit', () => {
    expect(isOlderThanAgeLimit('1988-10-30', '2026-10-30', 38)).toBe(false);
  });

  it('rejects a pet one day past the limit', () => {
    expect(isOlderThanAgeLimit('1988-10-29', '2026-10-30', 38)).toBe(true);
  });

  it('allows a young pet', () => {
    expect(isOlderThanAgeLimit('2024-01-01', '2026-10-30', 20)).toBe(false);
  });
});
