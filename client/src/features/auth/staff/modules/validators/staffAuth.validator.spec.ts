import { describe, expect, it } from 'vitest';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  staffLoginSchema,
  totpCodeSchema,
} from './staffAuth.validator';

describe('staffAuth.validator', () => {
  it('accepts username/password credentials', () => {
    expect(
      staffLoginSchema.safeParse({ identifier: 'admin', password: 'secret' })
        .success
    ).toBe(true);
  });

  it('accepts email/password credentials', () => {
    expect(
      staffLoginSchema.safeParse({
        identifier: 'admin@example.com',
        password: 'secret',
      }).success
    ).toBe(true);
  });

  it('rejects blank login credentials', () => {
    expect(
      staffLoginSchema.safeParse({ identifier: '', password: '' }).success
    ).toBe(false);
  });

  it('requires a 6-digit TOTP code', () => {
    expect(totpCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(totpCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });

  it('validates password reset email shape', () => {
    expect(
      forgotPasswordSchema.safeParse({ email: 'staff@example.com' }).success
    ).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'not-email' }).success).toBe(
      false
    );
  });

  it('accepts a matching, policy-meeting new password', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      }).success
    ).toBe(true);
  });

  it('rejects a new password shorter than 8 characters', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'short1',
        confirmPassword: 'short1',
      }).success
    ).toBe(false);
  });

  it('rejects mismatched password confirmation', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'newpassword123',
      confirmPassword: 'different123',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });
});
