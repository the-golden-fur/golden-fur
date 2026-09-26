import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import type { CheckInResult, SpinCreditSource } from '../rewards.types.ts';
import { summarizeSpinCredits } from './spinWheel.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Session 114: POST /rewards/check-in - the customer portal calls this once
 * per (Manila) day when it loads. It records the visit in
 * customer_login_days and grants any due daily-login / weekly-streak /
 * monthly-streak spins, via record_customer_login() (20260925214), which is
 * idempotent: repeat calls on the same day never grant twice.
 *
 * A portal visit rather than the login endpoint itself, because sessions
 * persist - a returning customer who never re-types their password still
 * visited that day.
 */
export async function recordCheckIn(
  requesterId: string
): Promise<CheckInResult> {
  const staffRole = await getStaffRoleOrNull(requesterId);
  if (staffRole) {
    throwWithStatus(403, 'Only customers can check in');
  }

  const { data: profile, error: profileError } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('id', requesterId)
    .maybeSingle();

  if (profileError) throwWithStatus(400, profileError.message);
  if (!profile) throwWithStatus(403, 'Only customers can check in');

  const { data, error } = await supabase.rpc('record_customer_login', {
    p_customer_id: requesterId,
  });

  if (error) throwWithStatus(400, error.message);

  const granted = (
    (data ?? []) as Array<{
      granted_promo_id: string;
      granted_source: SpinCreditSource;
    }>
  ).map((row) => ({
    promoId: row.granted_promo_id,
    source: row.granted_source,
  }));

  return {
    granted,
    credits: await summarizeSpinCredits(requesterId),
  };
}
