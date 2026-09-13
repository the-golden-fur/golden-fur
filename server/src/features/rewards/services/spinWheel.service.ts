import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { SpinHistoryEntry, SpinResult } from '../rewards.types.ts';
import {
  resolveTargetCustomerId,
  type RequesterScopedParams,
} from './rewardsAccess.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export async function getMySpinCreditCount(
  params: RequesterScopedParams
): Promise<number> {
  const targetCustomerId = await resolveTargetCustomerId(params);

  const { count, error } = await supabase
    .from('customer_spin_credits')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', targetCustomerId)
    .eq('is_consumed', false);

  if (error) throwWithStatus(400, error.message);

  return count ?? 0;
}

/**
 * Calls the spin_wheel() Postgres RPC (atomic: consumes a credit, rolls or
 * applies pity, records history, issues the resulting coupon - see
 * 20260913198_custom_rewards_create_spin_history_and_spin_wheel_rpc.sql).
 * The animation on the client always renders THIS result - it never picks
 * its own outcome.
 */
export async function spin(params: RequesterScopedParams): Promise<SpinResult> {
  const targetCustomerId = await resolveTargetCustomerId(params);

  const { data, error } = await supabase.rpc('spin_wheel', {
    p_customer_id: targetCustomerId,
  });

  if (error) {
    const message = /no available spin credit/.test(error.message)
      ? 'No spin credits available'
      : error.message;
    throwWithStatus(400, message);
  }

  // spin_wheel() is a `returns table(...)` function - supabase-js hands
  // back an array of rows (exactly one, here).
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        reward_id: string;
        was_pity: boolean;
        coupon_id: string;
        history_id: string;
      }
    | undefined;

  if (!row) throwWithStatus(500, 'spin_wheel returned no result');

  return {
    rewardId: row.reward_id,
    wasPity: row.was_pity,
    couponId: row.coupon_id,
    historyId: row.history_id,
  };
}

export async function listMySpinHistory(
  params: RequesterScopedParams
): Promise<SpinHistoryEntry[]> {
  const targetCustomerId = await resolveTargetCustomerId(params);

  const { data, error } = await supabase
    .from('spin_history')
    .select('*')
    .eq('customer_id', targetCustomerId)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as SpinHistoryEntry[];
}
