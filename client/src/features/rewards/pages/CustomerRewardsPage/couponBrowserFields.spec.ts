import { describe, expect, it } from 'vitest';
import {
  applyCouponFilters,
  COUPON_COMPARATORS,
  COUPON_GROUP_BY_AXES,
  deriveCouponSortKey,
  findRewardForCoupon,
  matchesCouponQuery,
} from './couponBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { CustomerCoupon, SpinWheelReward } from '../../rewards.types';

function buildCoupon(overrides: Partial<CustomerCoupon> = {}): CustomerCoupon {
  return {
    id: 'c-1',
    customer_id: 'cust-1',
    spin_wheel_reward_id: 'reward-1',
    spin_history_id: null,
    discount_type: 'Percentage',
    value: 10,
    is_redeemed: false,
    redeemed_at: null,
    redeemed_by_booking_id: null,
    redeemed_by_booking_group_id: null,
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildReward(
  overrides: Partial<SpinWheelReward> = {}
): SpinWheelReward {
  return {
    id: 'reward-1',
    label: 'Ten Percent Off',
    discount_type: 'Percentage',
    value: 10,
    rarity_percent: 50,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('applyCouponFilters', () => {
  it('narrows by status', () => {
    const coupons = [
      buildCoupon({ id: '1', is_redeemed: false }),
      buildCoupon({ id: '2', is_redeemed: true }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'used' }];
    expect(applyCouponFilters(coupons, tiles).map((c) => c.id)).toEqual(['2']);
  });
});

describe('matchesCouponQuery', () => {
  it('matches on the linked reward label or the discount value', () => {
    const coupon = buildCoupon({ value: 10 });
    expect(
      matchesCouponQuery(coupon, 'ten percent off', 'Ten Percent Off')
    ).toBe(true);
    expect(matchesCouponQuery(coupon, '10', null)).toBe(true);
    expect(matchesCouponQuery(coupon, 'flat 50', null)).toBe(false);
  });
});

describe('deriveCouponSortKey + COUPON_COMPARATORS', () => {
  it('defaults to obtained-newest', () => {
    expect(deriveCouponSortKey(null)).toBe('obtained-newest');
  });

  it('sorts by expiry, soonest first, with no-expiry coupons last', () => {
    const coupons = [
      buildCoupon({ id: '1', expires_at: null }),
      buildCoupon({ id: '2', expires_at: '2026-06-01' }),
      buildCoupon({ id: '3', expires_at: '2026-03-01' }),
    ];
    expect(
      [...coupons].sort(COUPON_COMPARATORS['expiry-soonest']).map((c) => c.id)
    ).toEqual(['3', '2', '1']);
  });
});

describe('COUPON_GROUP_BY_AXES', () => {
  it('groups by Status', () => {
    const axis = COUPON_GROUP_BY_AXES[0];
    expect(axis.columns).toEqual(['Available', 'Used']);
    expect(axis.columnFor(buildCoupon({ is_redeemed: true }))).toBe('Used');
  });
});

describe('findRewardForCoupon', () => {
  it('resolves the linked SpinWheelReward by id', () => {
    const rewards = [buildReward({ id: 'reward-1' })];
    const coupon = buildCoupon({ spin_wheel_reward_id: 'reward-1' });
    expect(findRewardForCoupon(coupon, rewards)?.label).toBe('Ten Percent Off');
  });

  it('returns null when the reward no longer exists', () => {
    const coupon = buildCoupon({ spin_wheel_reward_id: 'gone' });
    expect(findRewardForCoupon(coupon, [])).toBeNull();
  });
});
