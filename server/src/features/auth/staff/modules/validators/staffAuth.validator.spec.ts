import { describe, expect, it } from 'vitest';
import {
  staffAuthValidator,
  totpValidator,
  mfaEnrollValidator,
  mfaUnenrollValidator,
  mfaPreferenceValidator,
} from './staffAuth.validator.ts';

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

  it('carries through an optional device_token', () => {
    const input = {
      identifier: 'testuser',
      password: 'password123',
      device_token: 'raw-token',
    };
    const result = staffAuthValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.device_token).toBe('raw-token');
    }
  });
});

describe('totpValidator', () => {
  it('passes valid 6 digit code, defaulting method and remember_device', () => {
    const input = { code: '123456' };
    const result = totpValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        code: '123456',
        method: 'authenticator',
        remember_device: false,
      });
    }
  });

  it('carries through an explicit method and remember_device', () => {
    const input = { code: '123456', method: 'email', remember_device: true };
    const result = totpValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        code: '123456',
        method: 'email',
        remember_device: true,
      });
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

describe('mfaEnrollValidator', () => {
  it('defaults to authenticator when no method is given', () => {
    const result = mfaEnrollValidator.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('authenticator');
    }
  });

  it('accepts an explicit email method', () => {
    const result = mfaEnrollValidator.safeParse({ method: 'email' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('email');
    }
  });
});

describe('mfaUnenrollValidator', () => {
  it('requires a valid method', () => {
    expect(mfaUnenrollValidator.safeParse({}).success).toBe(false);
    expect(mfaUnenrollValidator.safeParse({ method: 'sms' }).success).toBe(
      false
    );
  });

  it('accepts authenticator or email', () => {
    expect(
      mfaUnenrollValidator.safeParse({ method: 'authenticator' }).success
    ).toBe(true);
    expect(mfaUnenrollValidator.safeParse({ method: 'email' }).success).toBe(
      true
    );
  });
});

describe('mfaPreferenceValidator', () => {
  it('requires a valid preferred_method', () => {
    expect(mfaPreferenceValidator.safeParse({}).success).toBe(false);
  });

  it('accepts authenticator or email', () => {
    const result = mfaPreferenceValidator.safeParse({
      preferred_method: 'email',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferred_method).toBe('email');
    }
  });
});
