import { RARITY_TIERS, type RarityTier } from '../rewards.types.ts';

/**
 * Session 114: a reward's chance of landing is computed, never stored -
 * weight / sum(weights of the ACTIVE, non-archived rewards in the same
 * pool), as a percent. Mirrors the spin_wheel() RPC's own weighted roll
 * (20260925214) so the % an admin sees is exactly the odds the server uses.
 *
 * Client twin: client/src/features/rewards/utils/rewardChance.ts (the two
 * sides can't share a module - separate npm workspaces).
 */

interface WeightedReward {
  weight: number;
  is_active: boolean;
  archived_at: string | null;
  rarity_tier: RarityTier;
}

export function isLandable(reward: WeightedReward): boolean {
  return reward.is_active && reward.archived_at === null;
}

/** Chance per reward, in the same order as the input. Inactive/archived
 * rewards get 0. Rounded to 2 decimals for display. */
export function computeChances<T extends WeightedReward>(
  rewards: T[]
): Array<T & { chance_percent: number }> {
  const total = rewards
    .filter(isLandable)
    .reduce((sum, reward) => sum + Number(reward.weight), 0);

  return rewards.map((reward) => ({
    ...reward,
    chance_percent:
      total > 0 && isLandable(reward)
        ? Math.round((Number(reward.weight) / total) * 10000) / 100
        : 0,
  }));
}

/** The rarest tier among landable rewards - what the pity system
 * guarantees. null for a pool with nothing landable. */
export function rarestTier(rewards: WeightedReward[]): RarityTier | null {
  let rarestIndex = -1;

  for (const reward of rewards) {
    if (!isLandable(reward)) continue;
    rarestIndex = Math.max(
      rarestIndex,
      RARITY_TIERS.indexOf(reward.rarity_tier)
    );
  }

  return rarestIndex >= 0 ? RARITY_TIERS[rarestIndex] : null;
}
