import { describe, expect, it } from 'vitest';
import { staffAuthValidator, totpValidator } from './staffAuth.validator.ts';

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

describe('totpValidator', () => {
  it('passes valid 6 digit code', () => {
    const input = { code: '123456' };
    const result = totpValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('fails when code is missing', () => {
    const input = {};
    const result = totpValidator.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when code is not 6 digits', () => {
    const input = { code: '12345' };
    const result = totpValidator.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when code contains non-digits', () => {
    const input = { code: '12345a' };
    const result = totpValidator.safeParse(input);
    expect(result.success).toBe(false);
  });
});
