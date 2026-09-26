import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  PromoWheel,
  SpinCreditSummary,
  SpinHistoryEntry,
  SpinResult,
} from '../rewards.types.ts';
import { getRewardPoolById } from './rewardPools.service.ts';
import {
  resolveTargetCustomerId,
  type RequesterScopedParams,
} from './rewardsAccess.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Groups a customer's unconsumed spin credits by the spin-wheel promo that
 * granted them. Promo names come from here (service role) - customers
 * can't read the promos table through RLS. */
export async function summarizeSpinCredits(
  customerId: string
): Promise<SpinCreditSummary> {
  const { data, error } = await supabase
    .from('customer_spin_credits')
    .select('promo_id, promos(name)')
    .eq('customer_id', customerId)
    .eq('is_consumed', false);

  if (error) throwWithStatus(400, error.message);

  const byPromo = new Map<
    string,
    { promoId: string; promoName: string; count: number }
  >();

  // A many-to-one embed arrives as an object at runtime; supabase-js's
  // generated-less typing calls it an array, hence the unknown cast.
  for (const row of (data ?? []) as unknown as Array<{
    promo_id: string;
    promos: { name: string } | Array<{ name: string }> | null;
  }>) {
    const promo = Array.isArray(row.promos) ? row.promos[0] : row.promos;
    const existing = byPromo.get(row.promo_id);
    if (existing) {
      existing.count += 1;
    } else {
      byPromo.set(row.promo_id, {
        promoId: row.promo_id,
        promoName: promo?.name ?? 'Spin wheel',
        count: 1,
      });
    }
  }

  const groups = [...byPromo.values()].sort((a, b) =>
    a.promoName.localeCompare(b.promoName)
  );

  return {
    total: groups.reduce((sum, group) => sum + group.count, 0),
    byPromo: groups,
  };
}

export async function getMySpinCredits(
  params: RequesterScopedParams
): Promise<SpinCreditSummary> {
  const targetCustomerId = await resolveTargetCustomerId(params);
  return summarizeSpinCredits(targetCustomerId);
}

/**
 * The wheel a customer sees for one spin-wheel promo: its pool's landable
 * rewards with their computed chances. Only reward labels/values/odds are
 * exposed - the same information the wheel legend already shows.
 */
export async function getPromoWheel(promoId: string): Promise<PromoWheel> {
  const { data, error } = await supabase
    .from('spin_wheel_promo_settings')
    .select('reward_pool_id, pity_threshold, promos(id, name, promo_type)')
    .eq('promo_id', promoId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  const settings = data as {
    reward_pool_id: string;
    pity_threshold: number | null;
    promos: { id: string; name: string; promo_type: string } | null;
  } | null;

  if (!settings || settings.promos?.promo_type !== 'spin_wheel') {
    throwWithStatus(404, 'Spin wheel promo not found');
  }

  const pool = await getRewardPoolById(settings.reward_pool_id);

  return {
    promoId,
    promoName: settings.promos.name,
    rarestTier: pool.rarest_tier,
    pityThreshold: settings.pity_threshold,
    rewards: pool.rewards
      .filter((reward) => reward.chance_percent > 0)
      .map((reward) => ({
        id: reward.id,
        label: reward.label,
        discount_type: reward.discount_type,
        value: reward.value,
        rarity_tier: reward.rarity_tier,
        chance_percent: reward.chance_percent,
      })),
  };
}

/**
 * Calls the spin_wheel() Postgres RPC (atomic: consumes a credit, rolls or
 * applies pity against that credit's promo's reward pool, records history,
 * issues the resulting coupon - see
 * 20260925214_custom_rewards_rewrite_spin_wheel_rpc_and_grant_triggers.sql).
 * The animation on the client always renders THIS result - it never picks
 * its own outcome.
 */
export async function spin(
  params: RequesterScopedParams & { promoId?: string }
): Promise<SpinResult> {
  const targetCustomerId = await resolveTargetCustomerId(params);

  const { data, error } = await supabase.rpc('spin_wheel', {
    p_customer_id: targetCustomerId,
    p_promo_id: params.promoId ?? null,
  });

  if (error) {
    if (/no available spin credit/.test(error.message)) {
      throwWithStatus(400, 'No spin credits available');
    }
    if (/no active rewards/.test(error.message)) {
      throwWithStatus(
        409,
        'This spin wheel has no rewards right now. Your spin is saved - please try again later.'
      );
    }
    throwWithStatus(400, error.message);
  }

  // spin_wheel() is a `returns table(...)` function - supabase-js hands
  // back an array of rows (exactly one, here).
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        reward_id: string;
        was_pity: boolean;
        coupon_id: string;
        history_id: string;
        wheel_promo_id: string;
      }
    | undefined;

  if (!row) throwWithStatus(500, 'spin_wheel returned no result');

  return {
    rewardId: row.reward_id,
    wasPity: row.was_pity,
    couponId: row.coupon_id,
    historyId: row.history_id,
    promoId: row.wheel_promo_id,
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
