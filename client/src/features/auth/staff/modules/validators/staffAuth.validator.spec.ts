import { describe, expect, it } from 'vitest';
import {
  forgotPasswordSchema,
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
});
