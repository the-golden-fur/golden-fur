import { generate } from 'otplib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { enrollTotpFactor } from '../../auth/api/supabaseAuth.api.ts';
import {
  decryptMfaEmailSecret,
  encryptMfaEmailSecret,
} from '../../crypto/mfaEmailSecret.ts';
import { sendMfaEmailCodeEmail } from '../../email/mfaEmailCodeEmail.ts';

export type MfaMethod = 'authenticator' | 'email';

interface ListedFactor {
  id: string;
  factor_type: string;
  status: string;
}

/** Mirrors supabaseAuth.api.ts's listTotpFactors - `.all` (not the typed
 * `.totp` property) is the one source of truth for every factor's state. */
function listTotpFactors(data: { all: ListedFactor[] }) {
  return data.all.filter((factor) => factor.factor_type === 'totp');
}

interface FactorMethodRow {
  factor_id: string;
  method: MfaMethod;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  last_code_sent_at: string | null;
}

async function listFactorMethodRows(
  userId: string
): Promise<FactorMethodRow[]> {
  const { data, error } = await supabase
    .from('mfa_factor_methods')
    .select(
      'factor_id, method, secret_ciphertext, secret_iv, last_code_sent_at'
    )
    .eq('user_id', userId);

  if (error) throw error;
  return data ?? [];
}

async function recordFactorMethod(params: {
  factorId: string;
  userId: string;
  method: MfaMethod;
  secret?: string;
}) {
  const encrypted =
    params.method === 'email' && params.secret
      ? encryptMfaEmailSecret(params.secret)
      : null;

  const { error } = await supabase.from('mfa_factor_methods').upsert(
    {
      factor_id: params.factorId,
      user_id: params.userId,
      method: params.method,
      secret_ciphertext: encrypted?.ciphertext ?? null,
      secret_iv: encrypted?.iv ?? null,
    },
    { onConflict: 'user_id,method' }
  );

  if (error) throw error;
}

/** Marked *before* the email actually sends (not after), so two near-
 * simultaneous requests can't both pass the cooldown check before either
 * updates the timestamp. */
async function touchLastCodeSentAt(userId: string) {
  await supabase
    .from('mfa_factor_methods')
    .update({ last_code_sent_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('method', 'email');
}

async function deleteFactorMethod(userId: string, method: MfaMethod) {
  const { error } = await supabase
    .from('mfa_factor_methods')
    .delete()
    .eq('user_id', userId)
    .eq('method', method);

  if (error) throw error;
}

/**
 * Which factor_id backs a given method for this user, resolving from our own
 * mapping table first. Falls back to Supabase's live factor list ONLY for
 * 'authenticator' and ONLY when no mapping row exists yet - an account that
 * enrolled its authenticator-app factor before this feature shipped has a
 * real verified (or mid-enrollment unverified) TOTP factor with no row here
 * at all. When found this way, the mapping is lazily backfilled so every
 * later lookup is direct. 'email' can never hit this fallback - it did not
 * exist before this feature, so a missing mapping row genuinely means "not
 * enrolled."
 */
async function resolveFactorId(
  userClient: SupabaseClient,
  userId: string,
  method: MfaMethod,
  rows: FactorMethodRow[]
): Promise<string | null> {
  const mapped = rows.find((row) => row.method === method);
  if (mapped) return mapped.factor_id;

  if (method !== 'authenticator') return null;

  const mappedFactorIds = new Set(rows.map((row) => row.factor_id));
  const { data, error } = await userClient.auth.mfa.listFactors();
  if (error || !data) return null;

  const legacyFactor = listTotpFactors(data)
    .filter((factor) => !mappedFactorIds.has(factor.id))
    .find(
      (factor) => factor.status === 'verified' || factor.status === 'unverified'
    );

  if (!legacyFactor) return null;

  await recordFactorMethod({
    factorId: legacyFactor.id,
    userId,
    method: 'authenticator',
  });

  return legacyFactor.id;
}

/** Enrolled = has a *verified* factor for that method - mirrors
 * getTotpEnrollmentStatus's existing verified-only definition. */
export async function getMfaMethodStatus(
  userClient: SupabaseClient,
  userId: string
): Promise<Record<MfaMethod, boolean>> {
  const [rows, { data: factorsData, error }] = await Promise.all([
    listFactorMethodRows(userId),
    userClient.auth.mfa.listFactors(),
  ]);

  if (error || !factorsData) {
    throw error ?? new Error('Failed to list factors');
  }

  const verifiedFactorIds = new Set(
    listTotpFactors(factorsData)
      .filter((factor) => factor.status === 'verified')
      .map((factor) => factor.id)
  );

  const authenticatorFactorId = await resolveFactorId(
    userClient,
    userId,
    'authenticator',
    rows
  );
  const emailFactorId =
    rows.find((row) => row.method === 'email')?.factor_id ?? null;

  return {
    authenticator: authenticatorFactorId
      ? verifiedFactorIds.has(authenticatorFactorId)
      : false,
    email: emailFactorId ? verifiedFactorIds.has(emailFactorId) : false,
  };
}

export interface EnrollMfaMethodResult {
  factorId: string;
  /** Only present for 'authenticator' - the QR/secret to scan. 'email' has
   * nothing to display; the first code is emailed directly instead. */
  totp?: { qr_code?: string; secret?: string; uri?: string };
}

const FRIENDLY_NAME_BY_METHOD: Record<MfaMethod, string> = {
  authenticator: 'authenticator-app',
  email: 'email',
};

/**
 * Enrolls a new factor for the given method. For 'email', this immediately
 * sends the first code (the equivalent of "here's your QR code" for
 * authenticator) - the caller still confirms it via confirmOrVerifyMethod
 * before it's usable, same two-step shape as authenticator enrollment.
 */
export async function enrollMfaMethod(
  userClient: SupabaseClient,
  userId: string,
  method: MfaMethod,
  toEmail: string
): Promise<EnrollMfaMethodResult> {
  const { data, error } = await enrollTotpFactor(
    userClient,
    FRIENDLY_NAME_BY_METHOD[method]
  );

  if (error || !data) {
    throw error ?? new Error('Failed to enroll factor');
  }

  const secret = data.totp?.secret;
  if (method === 'email' && !secret) {
    throw new Error('Enrollment did not return a secret');
  }

  await recordFactorMethod({
    factorId: data.id,
    userId,
    method,
    secret: method === 'email' ? secret : undefined,
  });

  if (method === 'email' && secret) {
    await touchLastCodeSentAt(userId);
    const code = await generate({ secret });
    await sendMfaEmailCodeEmail({ to: toEmail, code });
  }

  return {
    factorId: data.id,
    totp: method === 'authenticator' ? data.totp : undefined,
  };
}

const EMAIL_CODE_COOLDOWN_SECONDS = 20;

export type SendMfaEmailMethodCodeResult =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

/**
 * Emails a fresh code for an already-enrolled (or mid-enrollment) 'email'
 * factor - used both for "resend" and for the login-time "switch to email"
 * action, which needs a code sent before the user can enter one. Throttled
 * independently of the shared MFA lockout (which only covers failed
 * *verify* attempts) - this only requires a valid session, so without a
 * cooldown here a stolen/phished password alone could be used to
 * mail-bomb the account's inbox or burn through the email provider's quota.
 */
export async function sendMfaEmailMethodCode(
  userId: string,
  toEmail: string
): Promise<SendMfaEmailMethodCodeResult> {
  const rows = await listFactorMethodRows(userId);
  const emailRow = rows.find((row) => row.method === 'email');

  if (!emailRow?.secret_ciphertext || !emailRow.secret_iv) {
    return { status: 'not_configured' };
  }

  if (emailRow.last_code_sent_at) {
    const elapsedSeconds =
      (Date.now() - new Date(emailRow.last_code_sent_at).getTime()) / 1000;
    if (elapsedSeconds < EMAIL_CODE_COOLDOWN_SECONDS) {
      return {
        status: 'rate_limited',
        retryAfterSeconds: Math.ceil(
          EMAIL_CODE_COOLDOWN_SECONDS - elapsedSeconds
        ),
      };
    }
  }

  await touchLastCodeSentAt(userId);

  const secret = decryptMfaEmailSecret({
    ciphertext: emailRow.secret_ciphertext,
    iv: emailRow.secret_iv,
  });
  const code = await generate({ secret });
  await sendMfaEmailCodeEmail({ to: toEmail, code });
  return { status: 'sent' };
}

export interface MfaMethodChallengeResult {
  verifyError: { message: string } | null;
}

/** Challenges + verifies the given method's code in one call, mirroring the
 * existing inline challenge/verify pairing in staffAuth.controller.ts /
 * customerAuth.controller.ts. Returns null (not an error) if the method has
 * no resolvable factor at all - the caller treats that as "not enrolled". */
export async function challengeAndVerifyMfaMethod(
  userClient: SupabaseClient,
  userId: string,
  method: MfaMethod,
  code: string
): Promise<MfaMethodChallengeResult | null> {
  const rows = await listFactorMethodRows(userId);
  const factorId = await resolveFactorId(userClient, userId, method, rows);

  if (!factorId) return null;

  const { data: challengeData, error: challengeError } =
    await userClient.auth.mfa.challenge({ factorId });

  if (challengeError) {
    return { verifyError: { message: challengeError.message } };
  }

  const { error: verifyError } = await userClient.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  return { verifyError: verifyError ? { message: verifyError.message } : null };
}

export async function unenrollMfaMethod(
  userClient: SupabaseClient,
  userId: string,
  method: MfaMethod
): Promise<{ error: { message: string } | null }> {
  const rows = await listFactorMethodRows(userId);
  const factorId = await resolveFactorId(userClient, userId, method, rows);

  if (!factorId) {
    return { error: null };
  }

  const { error } = await userClient.auth.mfa.unenroll({ factorId });
  if (error) {
    return { error: { message: error.message } };
  }

  await deleteFactorMethod(userId, method);
  return { error: null };
}
