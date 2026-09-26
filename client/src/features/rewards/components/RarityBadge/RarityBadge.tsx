import type { RarityTier } from '../../rewards.types';
import styles from './RarityBadge.module.css';

const TIER_CLASS: Record<RarityTier, string> = {
  Common: styles.common,
  Uncommon: styles.uncommon,
  Rare: styles.rare,
  Epic: styles.epic,
  Legendary: styles.legendary,
};

/** Session 114: a reward's rarity tier as a small colored pill - shared by
 * the admin Rewards / Reward Pools tabs and the pool builder. */
export function RarityBadge({ tier }: { tier: RarityTier }) {
  return <span className={`${styles.badge} ${TIER_CLASS[tier]}`}>{tier}</span>;
}
