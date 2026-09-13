/**
 * Custom change (coupon spin wheel, session 86). Feature-local role lists
 * (mirrors maintenance.types.ts's MAINTENANCE_READ_ROLES/WRITE_ROLES rather
 * than importing across features) - reads (config, reward catalog) are open
 * to every authenticated staff role; the config/reward-catalog WRITE
 * surface (admin config page) is Admin/Superadmin only. The customer-facing
 * routes (spin, my-coupons, my-spin-credits, my-spin-history) are gated by
 * jwtMiddleware alone at the route level - any authenticated principal,
 * staff or customer - with ownership resolved in the service layer, same
 * shape as credits.routes.ts's own GET /credits/balances.
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

/** Singleton settings row (mirrors PricingConfiguration/PromoCapConfiguration) -
 * real, non-null defaults written by the migration itself
 * (20260913196_custom_rewards_create_spin_wheel_config_and_rewards.sql), not
 * a separate seed script, since a settings row is schema, not reference
 * data. */
export interface SpinWheelConfig {
  id: string;
  /** A spin credit is granted every time a customer's running completed-
   * bookings count crosses a multiple of this (a REPEATING milestone, e.g.
   * every 5th booking - never a one-time trigger). */
  bookings_milestone_interval: number;
  /** A spin credit is granted whenever a single transaction is fully paid
   * for at least this amount, independent of the bookings counter. */
  spend_threshold_amount: number;
  /** After this many spins without landing in the lowest-rarity pool, the
   * next spin is guaranteed to land there (and the counter resets). */
  pity_threshold: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

/** Admin-managed reward pool entry. Active, non-archived rewards' own
 * rarity_percent values must sum to exactly 100 (enforced by a deferred DB
 * trigger - see check_spin_wheel_rewards_sum in the same migration). */
export interface SpinWheelReward {
  id: string;
  label: string;
  discount_type: DiscountValueType;
  value: number;
  rarity_percent: number;
  is_active: boolean;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface SpinHistoryEntry {
  id: string;
  customer_id: string;
  spin_wheel_reward_id: string;
  spin_credit_id: string;
  was_pity: boolean;
  created_at: string;
}

/** Shape returned by the spin_wheel() Postgres RPC
 * (20260913198_custom_rewards_create_spin_history_and_spin_wheel_rpc.sql). */
export interface SpinResult {
  rewardId: string;
  wasPity: boolean;
  couponId: string;
  historyId: string;
}
