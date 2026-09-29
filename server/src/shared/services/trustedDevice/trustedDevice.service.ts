import { createHash, randomBytes } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';

const TRUSTED_DEVICE_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a new trusted-device token for this user, storing only its hash
 * (same "never store the verifiable secret itself" shape as everything else
 * here that persists a token). Returns the raw token once, for the client to
 * persist - it must never be recoverable from the stored row.
 */
export async function issueTrustedDeviceToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(
    Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase.from('trusted_devices').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });

  if (error) throw error;
  return token;
}

/**
 * Whether the given token is a currently-valid trusted-device credential for
 * this user. Touches last_used_at on a hit, best-effort (never blocks the
 * caller on that write failing).
 */
export async function isTrustedDevice(
  userId: string,
  token: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('trusted_devices')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error || !data) return false;
  if (new Date(data.expires_at).getTime() <= Date.now()) return false;

  void supabase
    .from('trusted_devices')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    ?.then?.(undefined, (updateError: unknown) => {
      console.error(
        'Failed to touch trusted device last_used_at:',
        updateError
      );
    });

  return true;
}

/**
 * Revokes every trusted-device row for this user - called whenever their MFA
 * configuration changes (a method is enrolled or unenrolled). A device
 * trusted under the old configuration has no business staying trusted once
 * the account's own idea of "verified" has changed; without this, resetting
 * a compromised factor wouldn't actually kick out a device an attacker had
 * separately gotten trusted.
 */
export async function revokeAllTrustedDevices(userId: string): Promise<void> {
  const { error } = await supabase
    .from('trusted_devices')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
}
