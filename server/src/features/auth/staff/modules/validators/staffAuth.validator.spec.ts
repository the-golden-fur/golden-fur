import { describe, expect, it } from 'vitest';
import { staffAuthValidator } from './staffAuth.validator.ts';

describe('staffAuth.validator', () => {
  it('passes valid input', () => {
    const input = { username: 'testuser', password: 'password123' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('fails when username is missing', () => {
    const input = { password: 'password123' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when password is missing', () => {
    const input = { username: 'testuser' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(false);
  });
});
