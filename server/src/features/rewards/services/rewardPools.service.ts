import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import { computeChances, rarestTier } from '../modules/rewardChance.ts';
import type { RewardPool, SpinWheelReward } from '../rewards.types.ts';
import type {
  CreateRewardPoolInput,
  UpdateRewardPoolInput,
} from '../modules/validators/rewards.validator.ts';

/**
 * Session 114: reward pools - named sets of spin_wheel_rewards that each
 * spin-wheel promo draws from (20260925210). Member chances are computed on
 * read (modules/rewardChance.ts), never stored.
 */

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const POOL_SELECT =
  '*, reward_pool_rewards(spin_wheel_rewards(*)), spin_wheel_promo_settings(promos(id, name, is_active, archived_at))';

interface PoolRow extends Omit<
  RewardPool,
  'rewards' | 'active_reward_count' | 'rarest_tier' | 'promos'
> {
  reward_pool_rewards?: Array<{ spin_wheel_rewards: SpinWheelReward | null }>;
  spin_wheel_promo_settings?: Array<{
    promos: {
      id: string;
      name: string;
      is_active: boolean;
      archived_at: string | null;
    } | null;
  }>;
}

export function toRewardPool(row: PoolRow): RewardPool {
  const {
    reward_pool_rewards: memberships,
    spin_wheel_promo_settings: settings,
    ...pool
  } = row;

  // Archived rewards are dropped from the member list entirely (restoring
  // one brings it back, since its membership row was never removed);
  // inactive ones stay visible at 0% so the admin can see why.
  const members = (memberships ?? [])
    .map((membership) => membership.spin_wheel_rewards)
    .filter(
      (reward): reward is SpinWheelReward =>
        reward !== null && reward.archived_at === null
    )
    .map((reward) => ({
      ...reward,
      weight: Number(reward.weight),
      value: Number(reward.value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const rewards = computeChances(members);

  return {
    ...pool,
    rewards,
    active_reward_count: rewards.filter((reward) => reward.is_active).length,
    rarest_tier: rarestTier(rewards),
    promos: (settings ?? [])
      .map((setting) => setting.promos)
      .filter(
        (promo): promo is NonNullable<typeof promo> =>
          promo !== null && promo.archived_at === null
      )
      .map((promo) => ({
        id: promo.id,
        name: promo.name,
        is_active: promo.is_active,
      })),
  };
}

export async function listRewardPools(
  includeInactive = true
): Promise<RewardPool[]> {
  let query = supabase
    .from('reward_pools')
    .select(POOL_SELECT)
    .is('archived_at', null);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return ((data ?? []) as PoolRow[]).map(toRewardPool);
}

export async function listArchivedRewardPools(): Promise<RewardPool[]> {
  const { data, error } = await supabase
    .from('reward_pools')
    .select(POOL_SELECT)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return ((data ?? []) as PoolRow[]).map(toRewardPool);
}

export async function getRewardPoolById(poolId: string): Promise<RewardPool> {
  const { data, error } = await supabase
    .from('reward_pools')
    .select(POOL_SELECT)
    .eq('id', poolId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Reward pool not found');

  return toRewardPool(data as PoolRow);
}

function translateWriteError(error: { code?: string; message: string }): never {
  if (error.code === '23505') {
    throwWithStatus(409, 'A reward pool with this name already exists');
  }
  throwWithStatus(400, error.message);
}

/** Replaces the pool's full member list (delete-then-insert - the join table
 * has no other columns worth preserving). */
async function replaceMembers(
  poolId: string,
  rewardIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('reward_pool_rewards')
    .delete()
    .eq('reward_pool_id', poolId);

  if (deleteError) throwWithStatus(400, deleteError.message);

  const uniqueIds = [...new Set(rewardIds)];
  if (uniqueIds.length === 0) return;

  const { error: insertError } = await supabase
    .from('reward_pool_rewards')
    .insert(
      uniqueIds.map((rewardId) => ({
        reward_pool_id: poolId,
        spin_wheel_reward_id: rewardId,
      }))
    );

  if (insertError) {
    if (insertError.code === '23503') {
      throwWithStatus(400, 'One or more selected rewards no longer exist');
    }
    throwWithStatus(400, insertError.message);
  }
}

export async function createRewardPool(
  requesterId: string,
  input: CreateRewardPoolInput
): Promise<RewardPool> {
  const { data, error } = await supabase
    .from('reward_pools')
    .insert({
      name: input.name,
      description: input.description ?? null,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('id')
    .maybeSingle();

  if (error) translateWriteError(error);
  if (!data) throwWithStatus(400, 'Failed to create reward pool');

  const poolId = (data as { id: string }).id;
  await replaceMembers(poolId, input.reward_ids);

  return getRewardPoolById(poolId);
}

export async function updateRewardPool(
  requesterId: string,
  poolId: string,
  input: UpdateRewardPoolInput
): Promise<RewardPool> {
  const existing = await getRewardPoolById(poolId);

  // A live spin-wheel promo would silently stop granting spins (see
  // spin_wheel_promo_is_live) - make the admin deactivate/re-point the
  // promo first so the cause is obvious.
  if (input.is_active === false && existing.is_active) {
    const activePromos = existing.promos.filter((promo) => promo.is_active);
    if (activePromos.length > 0) {
      throwWithStatus(
        409,
        `This pool is used by active spin wheel promo(s): ${activePromos
          .map((promo) => promo.name)
          .join(', ')}. Deactivate those promos or pick another pool first.`
      );
    }
  }

  const { reward_ids: rewardIds, ...fields } = input;

  const { error } = await supabase
    .from('reward_pools')
    .update({
      ...fields,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', poolId);

  if (error) translateWriteError(error);

  if (rewardIds !== undefined) {
    await replaceMembers(poolId, rewardIds);
  }

  return getRewardPoolById(poolId);
}

export async function archiveRewardPool(poolId: string): Promise<void> {
  const pool = await getRewardPoolById(poolId);
  assertInactiveBeforeArchive(pool.is_active, 'This reward pool');

  const { error } = await supabase
    .from('reward_pools')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', poolId);

  if (error) throwWithStatus(400, error.message);
}

export async function restoreRewardPool(poolId: string): Promise<void> {
  const { error } = await supabase
    .from('reward_pools')
    .update({ archived_at: null })
    .eq('id', poolId);

  if (error) translateWriteError(error);
}

export async function hardDeleteRewardPool(poolId: string): Promise<void> {
  const pool = await getRewardPoolById(poolId);
  assertArchivedBeforeHardDelete(pool.archived_at, 'This reward pool');

  const { error } = await supabase
    .from('reward_pools')
    .delete()
    .eq('id', poolId);

  if (error) {
    // spin_wheel_promo_settings.reward_pool_id is ON DELETE RESTRICT, and
    // spin_history.reward_pool_id records every pool a spin was made from.
    if (error.code === '23503') {
      throwWithStatus(
        409,
        'This reward pool is used by a spin wheel promo or past spins and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
