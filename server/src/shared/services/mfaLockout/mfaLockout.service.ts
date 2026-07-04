import { supabase } from '../../../config/supabase/supabase.config.ts';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

export interface MfaLockoutStatus {
  locked: boolean;
  lockedUntil: string | null;
  retryAfterSeconds: number | null;
  failedAttempts: number;
}

interface MfaLockoutRow {
  failed_attempts: number;
  locked_until: string | null;
}

function getRetryAfterSeconds(lockedUntil: string | null, now = new Date()) {
  if (!lockedUntil) {
    return null;
  }

  const retryAfterMs = new Date(lockedUntil).getTime() - now.getTime();
  return retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : null;
}

function toStatus(row: MfaLockoutRow | null): MfaLockoutStatus {
  const retryAfterSeconds = getRetryAfterSeconds(row?.locked_until ?? null);

  return {
    locked: retryAfterSeconds !== null,
    lockedUntil: row?.locked_until ?? null,
    retryAfterSeconds,
    failedAttempts: row?.failed_attempts ?? 0,
  };
}

export function formatMfaLockoutResponse(status: MfaLockoutStatus) {
  return {
    error: 'MFA verification locked',
    message: `Too many invalid MFA codes. Try again in ${status.retryAfterSeconds} seconds.`,
    retry_after_seconds: status.retryAfterSeconds,
    locked_until: status.lockedUntil,
  };
}

export async function checkMfaLockout(
  userId: string
): Promise<MfaLockoutStatus> {
  const { data, error } = await supabase
    .from('mfa_lockouts')
    .select('failed_attempts, locked_until')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return toStatus(data as MfaLockoutRow | null);
}

export async function incrementMfaLockout(
  userId: string
): Promise<MfaLockoutStatus> {
  const currentStatus = await checkMfaLockout(userId);
  const failedAttempts = currentStatus.failedAttempts + 1;
  const lockedUntil =
    failedAttempts >= LOCKOUT_THRESHOLD
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

  const { data, error } = await supabase
    .from('mfa_lockouts')
    .upsert(
      {
        user_id: userId,
        failed_attempts: failedAttempts,
        locked_until: lockedUntil,
        last_attempt_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('failed_attempts, locked_until')
    .single();

  if (error) {
    throw error;
  }

  return toStatus(data as MfaLockoutRow);
}

export async function resetMfaLockout(userId: string) {
  const { error } = await supabase.from('mfa_lockouts').upsert(
    {
      user_id: userId,
      failed_attempts: 0,
      locked_until: null,
      last_attempt_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw error;
  }
}
