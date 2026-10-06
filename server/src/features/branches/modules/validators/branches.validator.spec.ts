import { describe, expect, it } from 'vitest';
import {
  createBranchValidator,
  updateBranchValidator,
} from './branches.validator.ts';

describe('updateBranchValidator', () => {
  it('accepts a partial update with valid operating hours', () => {
    const result = updateBranchValidator.safeParse({
      address: '456 Makati Ave',
      operating_hours: {
        monday: { open: '08:00', close: '18:00' },
        sunday: { open: '09:00', close: '15:00' },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a close time that is not after open', () => {
    const result = updateBranchValidator.safeParse({
      operating_hours: {
        monday: { open: '18:00', close: '08:00' },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a malformed time string', () => {
    const result = updateBranchValidator.safeParse({
      operating_hours: {
        monday: { open: '8am', close: '18:00' },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown weekday key', () => {
    const result = updateBranchValidator.safeParse({
      operating_hours: {
        someday: { open: '08:00', close: '18:00' },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    const result = updateBranchValidator.safeParse({
      unexpected_field: true,
    });

    expect(result.success).toBe(false);
  });

  it('accepts clearing contact_number to null', () => {
    const result = updateBranchValidator.safeParse({ contact_number: null });

    expect(result.success).toBe(true);
  });

  describe('grooming_hours', () => {
    const operating_hours = {
      monday: { open: '08:00', close: '18:00' },
    };

    it("accepts Grooming hours inside that day's operating hours", () => {
      const result = updateBranchValidator.safeParse({
        operating_hours,
        grooming_hours: { monday: { open: '10:00', close: '15:00' } },
      });

      expect(result.success).toBe(true);
    });

    it('accepts an empty map (Grooming follows the operating hours)', () => {
      const result = updateBranchValidator.safeParse({
        operating_hours,
        grooming_hours: {},
      });

      expect(result.success).toBe(true);
    });

    it('rejects Grooming hours on a day the branch is closed', () => {
      const result = updateBranchValidator.safeParse({
        operating_hours,
        grooming_hours: { sunday: { open: '10:00', close: '12:00' } },
      });

      expect(result.success).toBe(false);
    });

    it("rejects Grooming hours that run outside that day's operating hours", () => {
      const result = updateBranchValidator.safeParse({
        operating_hours,
        grooming_hours: { monday: { open: '07:00', close: '12:00' } },
      });

      expect(result.success).toBe(false);
    });

    it('rejects a Grooming end time that is not after its start', () => {
      const result = updateBranchValidator.safeParse({
        operating_hours,
        grooming_hours: { monday: { open: '15:00', close: '10:00' } },
      });

      expect(result.success).toBe(false);
    });
  });
});

describe('createBranchValidator', () => {
  it('defaults grooming_hours to an empty map', () => {
    const result = createBranchValidator.safeParse({
      name: 'Alabang',
      address: '1 Sample St',
      timezone: 'Asia/Manila',
    });

    expect(result.success && result.data.grooming_hours).toEqual({});
  });

  it("rejects Grooming hours outside the new branch's operating hours", () => {
    const result = createBranchValidator.safeParse({
      name: 'Alabang',
      address: '1 Sample St',
      timezone: 'Asia/Manila',
      operating_hours: { monday: { open: '09:00', close: '17:00' } },
      grooming_hours: { monday: { open: '09:00', close: '19:00' } },
    });

    expect(result.success).toBe(false);
  });
});
