import { RARITY_TIERS, type RarityTier } from '../rewards.types';

/**
 * Session 114: a reward's chance of landing is weight / total weight of the
 * active, non-archived rewards in the same pool, as a percent - so an admin
 * can add or deactivate any reward without rebalancing the others.
 *
 * Server twin: server/src/features/rewards/modules/rewardChance.ts (the
 * server computes the authoritative chances it returns; this copy powers
 * the live preview in the reward pool builder before anything is saved).
 * Duplicated rather than shared - client and server are separate npm
 * workspaces, same reasoning as shared/utils/promoEligibility.ts.
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

/** Rarest-first sort index (Legendary = 0) for tier-grouped lists. */
export function tierRank(tier: RarityTier): number {
  return RARITY_TIERS.length - 1 - RARITY_TIERS.indexOf(tier);
}

/** "12.5%" / "33.33%" - trims a trailing .00. */
export function formatChance(percent: number): string {
  return `${Number(percent.toFixed(2))}%`;
}
