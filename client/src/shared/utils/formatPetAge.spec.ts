import { describe, expect, it } from 'vitest';
import { formatPetAge } from './formatPetAge';

const TODAY = new Date(2026, 9, 12); // 12 Oct 2026, local time

describe('formatPetAge', () => {
  it('shows years and months', () => {
    expect(formatPetAge('2023-08-12', TODAY)).toBe('3 yr 2 mo');
  });

  it('drops the months on an exact number of years', () => {
    expect(formatPetAge('2023-10-12', TODAY)).toBe('3 yr');
  });

  it('does not count a birthday that has not been reached yet this year', () => {
    expect(formatPetAge('2023-10-13', TODAY)).toBe('2 yr 11 mo');
  });

  it('shows months only for a pet under a year old', () => {
    expect(formatPetAge('2026-05-01', TODAY)).toBe('5 mo');
  });

  it('shows days for a pet under a month old', () => {
    expect(formatPetAge('2026-09-30', TODAY)).toBe('12 days');
    expect(formatPetAge('2026-10-11', TODAY)).toBe('1 day');
    expect(formatPetAge('2026-10-12', TODAY)).toBe('0 days');
  });

  it('accepts a full ISO timestamp', () => {
    expect(formatPetAge('2023-08-12T00:00:00.000Z', TODAY)).toBe('3 yr 2 mo');
  });

  it('returns null when there is nothing usable to calculate from', () => {
    expect(formatPetAge(null, TODAY)).toBeNull();
    expect(formatPetAge('', TODAY)).toBeNull();
    expect(formatPetAge('not-a-date', TODAY)).toBeNull();
    expect(formatPetAge('2024-02-31', TODAY)).toBeNull();
  });

  it('returns null for a date in the future', () => {
    expect(formatPetAge('2026-10-13', TODAY)).toBeNull();
  });
});
