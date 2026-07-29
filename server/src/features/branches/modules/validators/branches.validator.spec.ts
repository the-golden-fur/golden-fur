import { describe, expect, it } from 'vitest';
import { updateBranchValidator } from './branches.validator.ts';

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
});
