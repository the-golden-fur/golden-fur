import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * Encrypts/decrypts the shared TOTP secret behind a user's "email" MFA
 * method (mfa_factor_methods.secret_ciphertext/-_iv). The "email" method is,
 * under the hood, a real Supabase TOTP factor - the server independently
 * computes the current code from this secret (mfaEmailCode.ts) and emails it
 * instead of the user's own authenticator app doing so, which is the only
 * way an email-verified session can still reach Supabase's real aal2 (see
 * mfa_factor_methods migration's comment). That means the server must be
 * able to read this secret back, unlike an authenticator-app factor's secret,
 * which the server never learns at all - hence a dedicated key/module rather
 * than reusing tempCredential.ts's, so the two purposes can be rotated
 * independently.
 *
 * MFA_EMAIL_SECRET_KEY must be a 32-byte key, base64-encoded (e.g.
 * `openssl rand -base64 32`). Read lazily (not at module load) so importing
 * this module never crashes a process that doesn't need it configured yet.
 */
function getKey(): Buffer {
  const raw = process.env.MFA_EMAIL_SECRET_KEY;

  if (!raw) {
    throw new Error('MFA_EMAIL_SECRET_KEY is not configured');
  }

  const key = Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw new Error('MFA_EMAIL_SECRET_KEY must decode to exactly 32 bytes');
  }

  return key;
}

export interface EncryptedMfaEmailSecret {
  ciphertext: string;
  iv: string;
}

/** authTag is appended to the ciphertext (base64) - both travel together as
 * one opaque string, so the two DB columns stay a simple {ciphertext, iv}
 * pair rather than three. */
export function encryptMfaEmailSecret(
  plaintext: string
): EncryptedMfaEmailSecret {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function decryptMfaEmailSecret({
  ciphertext,
  iv,
}: EncryptedMfaEmailSecret): string {
  const combined = Buffer.from(ciphertext, 'base64');
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(0, combined.length - 16);

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8'
  );
}
