import { describe, expect, it } from 'vitest';
import {
  applyRewardFilters,
  deriveRewardSortKey,
  matchesRewardQuery,
  REWARD_COMPARATORS,
  REWARD_GROUP_BY_AXES,
} from './rewardBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { SpinWheelReward } from '../../rewards.types';

function buildReward(overrides: Partial<SpinWheelReward> = {}): SpinWheelReward {
  return {
    id: 'r-1',
    label: 'Ten Percent Off',
    discount_type: 'Percentage',
    value: 10,
    rarity_percent: 60,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('applyRewardFilters', () => {
  const rewards = [
    buildReward({ id: '1', is_active: true, discount_type: 'Percentage' }),
    buildReward({ id: '2', is_active: false, discount_type: 'Flat' }),
  ];

  it('narrows by status', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyRewardFilters(rewards, tiles).map((r) => r.id)).toEqual(['2']);
  });

  it('narrows by discount type', () => {
    const tiles: FilterTile[] = [{ fieldId: 'discountType', value: 'Flat' }];
    expect(applyRewardFilters(rewards, tiles).map((r) => r.id)).toEqual(['2']);
  });
});

describe('matchesRewardQuery', () => {
  it('matches on label', () => {
    const reward = buildReward({ label: 'Ten Percent Off' });
    expect(matchesRewardQuery(reward, 'ten')).toBe(true);
    expect(matchesRewardQuery(reward, 'flat')).toBe(false);
  });
});

describe('deriveRewardSortKey + REWARD_COMPARATORS', () => {
  it('defaults to label-asc', () => {
    expect(deriveRewardSortKey(null)).toBe('label-asc');
  });

  it('sorts by rarity high to low', () => {
    const rewards = [
      buildReward({ id: '1', rarity_percent: 10 }),
      buildReward({ id: '2', rarity_percent: 90 }),
    ];
    expect(
      [...rewards].sort(REWARD_COMPARATORS['rarity-desc']).map((r) => r.id)
    ).toEqual(['2', '1']);
  });
});

describe('REWARD_GROUP_BY_AXES', () => {
  it('offers Status and Discount type axes', () => {
    expect(REWARD_GROUP_BY_AXES.map((axis) => axis.id)).toEqual([
      'status',
      'discountType',
    ]);
  });
});
