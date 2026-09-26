import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { SpinWheelReward } from '../rewards.types.ts';
import type {
  CreateSpinWheelRewardInput,
  UpdateSpinWheelRewardInput,
} from '../modules/validators/rewards.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Embeds the (non-archived) pools each reward belongs to, so the admin
 * Rewards tab can show "In N pools" without a second round trip. */
const REWARD_SELECT =
  '*, reward_pool_rewards(reward_pools(id, name, archived_at))';

interface RewardRow extends Omit<SpinWheelReward, 'pools'> {
  reward_pool_rewards?: Array<{
    reward_pools: {
      id: string;
      name: string;
      archived_at: string | null;
    } | null;
  }>;
}

function toReward(row: RewardRow): SpinWheelReward {
  const { reward_pool_rewards: memberships, ...reward } = row;

  return {
    ...reward,
    weight: Number(reward.weight),
    value: Number(reward.value),
    pools: (memberships ?? [])
      .map((membership) => membership.reward_pools)
      .filter(
        (pool): pool is { id: string; name: string; archived_at: null } =>
          pool !== null && pool.archived_at === null
      )
      .map((pool) => ({ id: pool.id, name: pool.name })),
  };
}

export async function listSpinWheelRewards(
  includeInactive = false
): Promise<SpinWheelReward[]> {
  let query = supabase
    .from('spin_wheel_rewards')
    .select(REWARD_SELECT)
    .is('archived_at', null);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query
    .order('rarity_tier', { ascending: true })
    .order('label', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return ((data ?? []) as RewardRow[]).map(toReward);
}

export async function listArchivedSpinWheelRewards(): Promise<
  SpinWheelReward[]
> {
  const { data, error } = await supabase
    .from('spin_wheel_rewards')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return ((data ?? []) as RewardRow[]).map(toReward);
}

export async function getSpinWheelRewardById(
  rewardId: string
): Promise<SpinWheelReward> {
  const { data, error } = await supabase
    .from('spin_wheel_rewards')
    .select(REWARD_SELECT)
    .eq('id', rewardId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Spin wheel reward not found');

  return toReward(data as RewardRow);
}

/**
 * No cross-row rule to enforce any more (session 114): a reward's chance is
 * computed from its weight relative to its pool, so any single create,
 * update, or deactivate is valid on its own.
 */
export async function createSpinWheelReward(
  requesterId: string,
  input: CreateSpinWheelRewardInput
): Promise<SpinWheelReward> {
  const { data, error } = await supabase
    .from('spin_wheel_rewards')
    .insert({
      ...input,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select(REWARD_SELECT)
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to create spin wheel reward'
    );
  }

  return toReward(data as RewardRow);
}

export async function updateSpinWheelReward(
  requesterId: string,
  rewardId: string,
  updates: UpdateSpinWheelRewardInput
): Promise<SpinWheelReward> {
  const { data, error } = await supabase
    .from('spin_wheel_rewards')
    .update({
      ...updates,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rewardId)
    .select(REWARD_SELECT)
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to update spin wheel reward'
    );
  }

  return toReward(data as RewardRow);
}

export async function archiveSpinWheelReward(rewardId: string): Promise<void> {
  const reward = await getSpinWheelRewardById(rewardId);
  assertInactiveBeforeArchive(reward.is_active, 'This reward');

  const { error } = await supabase
    .from('spin_wheel_rewards')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', rewardId);

  if (error) throwWithStatus(400, error.message);
}

export async function restoreSpinWheelReward(rewardId: string): Promise<void> {
  const { error } = await supabase
    .from('spin_wheel_rewards')
    .update({ archived_at: null })
    .eq('id', rewardId);

  if (error) throwWithStatus(400, error.message);
}

export async function hardDeleteSpinWheelReward(
  rewardId: string
): Promise<void> {
  const reward = await getSpinWheelRewardById(rewardId);
  assertArchivedBeforeHardDelete(reward.archived_at, 'This reward');

  const { error } = await supabase
    .from('spin_wheel_rewards')
    .delete()
    .eq('id', rewardId);

  if (error) {
    // spin_history references every reward a customer has ever won.
    if (error.code === '23503') {
      throwWithStatus(
        409,
        'This reward has already been won by a customer and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
