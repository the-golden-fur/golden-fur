/**
 * Custom change (coupon spin wheel, session 86; reward pools + spin-wheel
 * promos, session 114). Feature-local role lists (mirrors
 * maintenance.types.ts's MAINTENANCE_READ_ROLES/WRITE_ROLES rather than
 * importing across features) - reads (reward catalog, reward pools) are open
 * to every authenticated staff role; the WRITE surface (Settings > Promos &
 * Rewards > Rewards / Reward Pools) is Admin/Superadmin only. The
 * customer-facing routes (check-in, spin, per-promo wheel, my-coupons,
 * my-spin-credits, my-spin-history) are gated by jwtMiddleware alone at the
 * route level - any authenticated principal, staff or customer - with
 * ownership resolved in the service layer, same shape as
 * credits.routes.ts's own GET /credits/balances.
 */
export const REWARDS_READ_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

export const REWARDS_WRITE_ROLES: readonly string[] = ['Admin', 'Superadmin'];

export type DiscountValueType = 'Percentage' | 'Flat';

/** Declaration order = rarity order (Common is the most common), matching
 * the reward_rarity_tier Postgres enum (20260925209). */
export const RARITY_TIERS = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
] as const;

export type RarityTier = (typeof RARITY_TIERS)[number];

/** A reward in the admin catalog. Its chance of landing is NOT stored - it's
 * weight / sum(active weights) within whichever reward pool is being spun
 * (see modules/rewardChance.ts), so adding or deactivating one reward never
 * requires rebalancing any other. */
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

/** A reward with its computed chance within one specific pool. */
export interface RewardWithChance extends SpinWheelReward {
  /** 0 for an inactive/archived member - it's in the pool but can't land. */
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
  /** Number of active member rewards (the ones that can actually land). */
  active_reward_count: number;
  /** Rarest tier among active members - what pity guarantees. */
  rarest_tier: RarityTier | null;
  /** Spin-wheel promos currently pointing at this pool. */
  promos: Array<{ id: string; name: string; is_active: boolean }>;
}

/** A customer-facing wheel for one spin-wheel promo. */
export interface PromoWheel {
  promoId: string;
  promoName: string;
  rarestTier: RarityTier | null;
  pityThreshold: number | null;
  rewards: Array<{
    id: string;
    label: string;
    discount_type: DiscountValueType;
    value: number;
    rarity_tier: RarityTier;
    chance_percent: number;
  }>;
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

/** A single, per-customer, single-use spin outcome - snapshotted
 * discount_type/value at issuance so a later reward-catalog edit never
 * changes an already-issued coupon. Selectable at the booking-time Promos &
 * Coupons step alongside promos (see booking.service.ts's
 * resolveDiscountAndPromos). */
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
  /** The won reward's title (listMyCoupons only). */
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

/** Shape returned by the spin_wheel() Postgres RPC
 * (20260925214_custom_rewards_rewrite_spin_wheel_rpc_and_grant_triggers.sql). */
export interface SpinResult {
  rewardId: string;
  wasPity: boolean;
  couponId: string;
  historyId: string;
  promoId: string;
}
