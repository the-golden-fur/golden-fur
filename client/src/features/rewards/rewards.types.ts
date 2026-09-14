export type DiscountValueType = 'Percentage' | 'Flat';

export interface SpinWheelConfig {
  id: string;
  bookings_milestone_interval: number;
  spend_threshold_amount: number;
  pity_threshold: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

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

/** Shape returned by POST /rewards/spin. */
export interface SpinResult {
  rewardId: string;
  wasPity: boolean;
  couponId: string;
  historyId: string;
}

export interface UpsertSpinWheelConfigPayload {
  bookings_milestone_interval?: number;
  spend_threshold_amount?: number;
  pity_threshold?: number;
}

export interface CreateSpinWheelRewardPayload {
  label: string;
  discount_type: DiscountValueType;
  value: number;
  rarity_percent: number;
}

export interface UpdateSpinWheelRewardPayload {
  label?: string;
  discount_type?: DiscountValueType;
  value?: number;
  rarity_percent?: number;
  is_active?: boolean;
}
