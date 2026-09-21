import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { SpinWheelReward } from '../../rewards.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const DISCOUNT_TYPE_OPTIONS = [
  { value: 'Percentage', label: 'Percentage' },
  { value: 'Flat', label: 'Flat' },
];

export const REWARD_FILTER_FIELDS: FilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
  {
    id: 'discountType',
    label: 'Discount type',
    type: 'select',
    defaultValue: 'Percentage',
    options: DISCOUNT_TYPE_OPTIONS,
    formatValue: (value) =>
      DISCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  },
];

export type RewardSortKey =
  | 'label-asc'
  | 'label-desc'
  | 'value-desc'
  | 'value-asc'
  | 'rarity-desc'
  | 'rarity-asc';

export const REWARD_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'label',
    label: 'Title',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'value',
    label: 'Value',
    directions: [
      { value: 'desc', label: 'High to low' },
      { value: 'asc', label: 'Low to high' },
    ],
  },
  {
    id: 'rarity',
    label: 'Rarity',
    directions: [
      { value: 'desc', label: 'High to low' },
      { value: 'asc', label: 'Low to high' },
    ],
  },
];

export const REWARD_COMPARATORS: Record<
  RewardSortKey,
  (a: SpinWheelReward, b: SpinWheelReward) => number
> = {
  'label-asc': (a, b) => a.label.localeCompare(b.label),
  'label-desc': (a, b) => b.label.localeCompare(a.label),
  'value-desc': (a, b) => b.value - a.value,
  'value-asc': (a, b) => a.value - b.value,
  'rarity-desc': (a, b) => b.rarity_percent - a.rarity_percent,
  'rarity-asc': (a, b) => a.rarity_percent - b.rarity_percent,
};

export function deriveRewardSortKey(sortTile: SortTile | null): RewardSortKey {
  if (!sortTile) return 'label-asc';
  if (sortTile.fieldId === 'value') {
    return sortTile.direction === 'asc' ? 'value-asc' : 'value-desc';
  }
  if (sortTile.fieldId === 'rarity') {
    return sortTile.direction === 'asc' ? 'rarity-asc' : 'rarity-desc';
  }
  return sortTile.direction === 'desc' ? 'label-desc' : 'label-asc';
}

export function matchesRewardQuery(
  reward: SpinWheelReward,
  query: string
): boolean {
  return reward.label.toLowerCase().includes(query);
}

/** Every filter tile here is client-side only - `listSpinWheelRewards` has
 * no query params today. */
export function applyRewardFilters(
  rewards: SpinWheelReward[],
  tiles: FilterTile[]
): SpinWheelReward[] {
  let result = rewards;

  for (const tile of tiles) {
    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((reward) => reward.is_active === wantActive);
    }

    if (
      tile.fieldId === 'discountType' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((reward) => reward.discount_type === tile.value);
    }
  }

  return result;
}

export const REWARD_GROUP_BY_AXES: GroupByAxis<SpinWheelReward>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (reward) => (reward.is_active ? 'Active' : 'Inactive'),
  },
  {
    id: 'discountType',
    label: 'Discount type',
    columns: ['Percentage', 'Flat'],
    columnFor: (reward) => reward.discount_type,
  },
];
