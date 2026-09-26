export type DiscountValueType = 'Percentage' | 'Flat';

/** Declaration order = rarity order (Common is the most common) - mirrors
 * the reward_rarity_tier Postgres enum (session 114). */
export const RARITY_TIERS = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
] as const;

export type RarityTier = (typeof RARITY_TIERS)[number];

/** A reward in the admin catalog. Its chance of landing isn't stored - it's
 * weight / total active weight within whichever pool is spun (see
 * utils/rewardChance.ts). */
export interface SpinWheelReward {
  id: string;
  label: string;
  discount_type: DiscountValueType;
  value: number;
  rarity_tier: RarityTier;
  weight: number;
  is_active: boolean;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  /** Pools this reward belongs to (admin list only). */
  pools?: Array<{ id: string; name: string }>;
}

export interface RewardWithChance extends SpinWheelReward {
  chance_percent: number;
}

export interface RewardPool {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  rewards: RewardWithChance[];
  active_reward_count: number;
  rarest_tier: RarityTier | null;
  promos: Array<{ id: string; name: string; is_active: boolean }>;
}

/** One reward slice on a customer-facing wheel. */
export interface WheelReward {
  id: string;
  label: string;
  discount_type: DiscountValueType;
  value: number;
  rarity_tier: RarityTier;
  chance_percent: number;
}

export interface PromoWheel {
  promoId: string;
  promoName: string;
  rarestTier: RarityTier | null;
  pityThreshold: number | null;
  rewards: WheelReward[];
}

export interface SpinCreditSummary {
  total: number;
  byPromo: Array<{ promoId: string; promoName: string; count: number }>;
}

export type SpinCreditSource =
  | 'booking_milestone'
  | 'spend_threshold'
  | 'daily_login'
  | 'weekly_login_streak'
  | 'monthly_login_streak';

export interface CheckInResult {
  granted: Array<{ promoId: string; source: SpinCreditSource }>;
  credits: SpinCreditSummary;
}

export interface CustomerCoupon {
  id: string;
  customer_id: string;
  spin_wheel_reward_id: string | null;
  spin_history_id: string | null;
  discount_type: DiscountValueType;
  value: number;
  is_redeemed: boolean;
  redeemed_at: string | null;
  redeemed_by_booking_id: string | null;
  redeemed_by_booking_group_id: string | null;
  expires_at: string | null;
  created_at: string;
  /** The won reward's title, sent with each coupon by GET
   * /rewards/my-coupons (session 114). */
  reward_label?: string | null;
}

export interface SpinHistoryEntry {
  id: string;
  customer_id: string;
  spin_wheel_reward_id: string;
  spin_credit_id: string;
  promo_id: string;
  reward_pool_id: string | null;
  was_pity: boolean;
  created_at: string;
}

/** Shape returned by POST /rewards/spin. */
export interface SpinResult {
  rewardId: string;
  wasPity: boolean;
  couponId: string;
  historyId: string;
  promoId: string;
}

export interface CreateSpinWheelRewardPayload {
  label: string;
  discount_type: DiscountValueType;
  value: number;
  rarity_tier: RarityTier;
  weight: number;
}

export interface UpdateSpinWheelRewardPayload {
  label?: string;
  discount_type?: DiscountValueType;
  value?: number;
  rarity_tier?: RarityTier;
  weight?: number;
  is_active?: boolean;
}

export interface CreateRewardPoolPayload {
  name: string;
  description?: string | null;
  reward_ids: string[];
}

export interface UpdateRewardPoolPayload {
  name?: string;
  description?: string | null;
  reward_ids?: string[];
  is_active?: boolean;
}
