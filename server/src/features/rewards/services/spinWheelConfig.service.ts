import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { SpinWheelConfig, SpinWheelReward } from '../rewards.types.ts';
import type {
  CreateSpinWheelRewardInput,
  UpdateSpinWheelRewardInput,
  UpsertSpinWheelConfigInput,
} from '../modules/validators/rewards.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Singleton row - always exactly one (seeded by migration 196's own
 * `insert ... default values`), same shape as pricing_configuration/
 * promo_cap_configuration's own getters. */
export async function getSpinWheelConfig(): Promise<SpinWheelConfig> {
  const { data, error } = await supabase
    .from('spin_wheel_config')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(500, 'No spin_wheel_config row exists');

  return data as SpinWheelConfig;
}

export async function updateSpinWheelConfig(
  requesterId: string,
  updates: UpsertSpinWheelConfigInput
): Promise<SpinWheelConfig> {
  const existing = await getSpinWheelConfig();

  const { data, error } = await supabase
    .from('spin_wheel_config')
    .update({
      ...updates,
      updated_by_staff_id: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to update spin wheel config'
    );
  }

  return data as SpinWheelConfig;
}

export async function listSpinWheelRewards(
  includeInactive = false
): Promise<SpinWheelReward[]> {
  let query = supabase
    .from('spin_wheel_rewards')
    .select('*')
    .is('archived_at', null);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('rarity_percent', {
    ascending: true,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as SpinWheelReward[];
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

  return (data ?? []) as SpinWheelReward[];
}

export async function getSpinWheelRewardById(
  rewardId: string
): Promise<SpinWheelReward> {
  const { data, error } = await supabase
    .from('spin_wheel_rewards')
    .select('*')
    .eq('id', rewardId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Spin wheel reward not found');

  return data as SpinWheelReward;
}

/**
 * The active-rewards-sum-to-100 rule is authoritatively enforced by the
 * deferred DB trigger (check_spin_wheel_rewards_sum) - a create/update/
 * archive that would break it always fails at commit, surfaced here as a
 * plain 400 from the insert/update's own error branch (Postgres exceptions
 * from a plpgsql trigger arrive as a regular query error, same as any other
 * CHECK constraint violation elsewhere in this codebase).
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
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to create spin wheel reward'
    );
  }

  return data as SpinWheelReward;
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
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to update spin wheel reward'
    );
  }

  return data as SpinWheelReward;
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

  if (error) throwWithStatus(400, error.message);
}
