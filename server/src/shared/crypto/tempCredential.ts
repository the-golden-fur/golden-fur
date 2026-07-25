import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * Encrypts/decrypts a staff member's temporary password at rest
 * (staff_profiles.temp_credential_ciphertext/-_iv - see the #74 support
 * migration). Supabase Auth never retains the plaintext after
 * auth.admin.createUser, so this is the only way Issue #74's resend action
 * can re-deliver the *same* password (AC-2) instead of silently generating a
 * new one. Cleared once the staff member logs in for the first time
 * (staffAuth.controller.ts) - a resend is only ever meaningful before that.
 *
 * STAFF_TEMP_CREDENTIAL_KEY must be a 32-byte key, base64-encoded (e.g.
 * `openssl rand -base64 32`). Read lazily (not at module load) so importing
 * this module never crashes a process that doesn't need it configured yet.
 */
function getKey(): Buffer {
  const raw = process.env.STAFF_TEMP_CREDENTIAL_KEY;

  if (!raw) {
    throw new Error('STAFF_TEMP_CREDENTIAL_KEY is not configured');
  }

  const key = Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw new Error(
      'STAFF_TEMP_CREDENTIAL_KEY must decode to exactly 32 bytes'
    );
  }

  return key;
}

export interface EncryptedTempCredential {
  ciphertext: string;
  iv: string;
}

/** authTag is appended to the ciphertext (base64) - both travel together as
 * one opaque string, so the two DB columns stay a simple {ciphertext, iv}
 * pair rather than three. */
export function encryptTempCredential(
  plaintext: string
): EncryptedTempCredential {
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

export function decryptTempCredential({
  ciphertext,
  iv,
}: EncryptedTempCredential): string {
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
