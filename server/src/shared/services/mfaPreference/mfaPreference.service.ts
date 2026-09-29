import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { MfaMethod } from '../mfaMethods/mfaMethods.service.ts';

/** Which method to challenge a user with first, when they have more than one
 * enrolled. Defaults to 'authenticator' for a user with no row yet, matching
 * the column's own default (every account before this feature shipped only
 * ever had that one method). */
export async function getMfaPreference(userId: string): Promise<MfaMethod> {
  const { data, error } = await supabase
    .from('mfa_preferences')
    .select('preferred_method')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.preferred_method as MfaMethod | undefined) ?? 'authenticator';
}

export async function setMfaPreference(
  userId: string,
  method: MfaMethod
): Promise<void> {
  const { error } = await supabase.from('mfa_preferences').upsert(
    {
      user_id: userId,
      preferred_method: method,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
}
