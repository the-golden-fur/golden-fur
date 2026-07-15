import { describe, expect, it } from 'vitest';
import { staffAuthValidator, totpValidator } from './staffAuth.validator.ts';

describe('staffAuth.validator', () => {
  it('passes valid input with identifier', () => {
    const input = { identifier: 'testuser', password: 'password123' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('accepts a legacy username field as the identifier', () => {
    const input = { username: 'testuser', password: 'password123' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        identifier: 'testuser',
        password: 'password123',
      });
    }
  });

  it('passes valid input with an email identifier', () => {
    const input = { identifier: 'staff@example.com', password: 'password123' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('fails when identifier is missing', () => {
    const input = { password: 'password123' };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when password is missing', () => {
    const input = { identifier: 'testuser' };
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
