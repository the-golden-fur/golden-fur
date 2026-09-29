import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  encryptMfaEmailSecret,
  decryptMfaEmailSecret,
} from './mfaEmailSecret.ts';

const VALID_KEY = 'XY7Cpo0DKGz77hC55/63x4qFY8dZmmfIhykbt5sNSZU=';

describe('mfaEmailSecret', () => {
  const originalKey = process.env.MFA_EMAIL_SECRET_KEY;

  beforeEach(() => {
    process.env.MFA_EMAIL_SECRET_KEY = VALID_KEY;
  });

  afterEach(() => {
    process.env.MFA_EMAIL_SECRET_KEY = originalKey;
  });

  it('round-trips a secret through encrypt then decrypt', () => {
    const encrypted = encryptMfaEmailSecret('JBSWY3DPEHPK3PXP');
    expect(decryptMfaEmailSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces a different iv (and ciphertext) on every call', () => {
    const first = encryptMfaEmailSecret('JBSWY3DPEHPK3PXP');
    const second = encryptMfaEmailSecret('JBSWY3DPEHPK3PXP');
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('throws when the key is not configured', () => {
    delete process.env.MFA_EMAIL_SECRET_KEY;
    expect(() => encryptMfaEmailSecret('JBSWY3DPEHPK3PXP')).toThrow(
      'MFA_EMAIL_SECRET_KEY is not configured'
    );
  });

  it('throws when the key does not decode to 32 bytes', () => {
    process.env.MFA_EMAIL_SECRET_KEY = 'dG9vLXNob3J0';
    expect(() => encryptMfaEmailSecret('JBSWY3DPEHPK3PXP')).toThrow(
      'MFA_EMAIL_SECRET_KEY must decode to exactly 32 bytes'
    );
  });

  it('fails to decrypt with a different key than it was encrypted with', () => {
    const encrypted = encryptMfaEmailSecret('JBSWY3DPEHPK3PXP');
    process.env.MFA_EMAIL_SECRET_KEY =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    expect(() => decryptMfaEmailSecret(encrypted)).toThrow();
  });
});
