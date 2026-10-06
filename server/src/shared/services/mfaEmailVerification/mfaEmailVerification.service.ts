import { createHash, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendMfaEmailVerificationEmail } from '../../email/mfaEmailVerificationEmail.ts';
import { unenrollMfaMethod } from '../mfaMethods/mfaMethods.service.ts';

const CODE_EXPIRY_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

interface RawRow {
  email: string;
  verified_at: string | null;
  code_hash: string | null;
  code_expires_at: string | null;
  code_sent_at: string | null;
}

async function getRow(userId: string): Promise<RawRow | null> {
  const { data, error } = await supabase
    .from('mfa_email_verifications')
    .select('email, verified_at, code_hash, code_expires_at, code_sent_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface MfaEmailVerificationStatus {
  email: string;
  verified: boolean;
}

/** Used both by the Account tab (show current bound email + status) and by
 * enrollMfaMethod's mandatory-role gate (is this user allowed to turn
 * 'email' on as an active MFA method yet). */
export async function getMfaEmailVerification(
  userId: string
): Promise<MfaEmailVerificationStatus | null> {
  const row = await getRow(userId);
  if (!row) return null;
  return { email: row.email, verified: Boolean(row.verified_at) };
}

export type StartMfaEmailVerificationResult =
  | { status: 'sent' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

/**
 * Sends a fresh 6-digit ownership-proof code to the given email and (re)sets
 * this user's binding to it, always resetting verified_at to null - used for
 * the automatic first-login send, an explicit resend, and "change email"
 * alike, since all three should require fresh proof of the (possibly new)
 * address. Throttled independently of every other MFA cooldown - this code
 * is entered manually back in Settings > Account, not consumed immediately
 * like a login code, so it needs a longer window than
 * mfaMethods.service.ts's EMAIL_CODE_COOLDOWN_SECONDS.
 */
export async function startMfaEmailVerification(
  userId: string,
  email: string
): Promise<StartMfaEmailVerificationResult> {
  const existing = await getRow(userId);

  if (existing?.code_sent_at) {
    const elapsedSeconds =
      (Date.now() - new Date(existing.code_sent_at).getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      return {
        status: 'rate_limited',
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds),
      };
    }
  }

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MINUTES * 60 * 1000);

  const { error } = await supabase.from('mfa_email_verifications').upsert(
    {
      user_id: userId,
      email,
      verified_at: null,
      code_hash: hashCode(code),
      code_expires_at: expiresAt.toISOString(),
      code_sent_at: now.toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;

  await sendMfaEmailVerificationEmail({ to: email, code });
  return { status: 'sent' };
}

export type ConfirmMfaEmailVerificationResult =
  | { status: 'verified' }
  | { status: 'no_pending_code' }
  | { status: 'expired' }
  | { status: 'invalid_code' };

export async function confirmMfaEmailVerification(
  userId: string,
  code: string
): Promise<ConfirmMfaEmailVerificationResult> {
  const row = await getRow(userId);

  if (!row?.code_hash || !row.code_expires_at) {
    return { status: 'no_pending_code' };
  }

  if (new Date(row.code_expires_at).getTime() <= Date.now()) {
    return { status: 'expired' };
  }

  if (row.code_hash !== hashCode(code)) {
    return { status: 'invalid_code' };
  }

  const { error } = await supabase
    .from('mfa_email_verifications')
    .update({
      verified_at: new Date().toISOString(),
      code_hash: null,
      code_expires_at: null,
      code_sent_at: null,
    })
    .eq('user_id', userId);

  if (error) throw error;
  return { status: 'verified' };
}

/** Clears the binding entirely and, if 'email' is currently an active MFA
 * factor, unenrolls it too - no dangling verified-but-unbound state where
 * the method still works despite the binding being gone. */
export async function unbindMfaEmail(
  userClient: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('mfa_email_verifications')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;

  await unenrollMfaMethod(userClient, userId, 'email');
}
