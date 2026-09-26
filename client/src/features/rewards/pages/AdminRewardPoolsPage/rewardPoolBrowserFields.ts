import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { RewardPool } from '../../rewards.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const USAGE_OPTIONS = [
  { value: 'used', label: 'Used by a promo' },
  { value: 'unused', label: 'Not used yet' },
];

export const POOL_FILTER_FIELDS: FilterField[] = [
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
    id: 'usage',
    label: 'Promo usage',
    type: 'select',
    defaultValue: 'used',
    options: USAGE_OPTIONS,
    formatValue: (value) =>
      USAGE_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
];

export type PoolSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'rewards-desc'
  | 'rewards-asc';

export const POOL_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'rewards',
    label: 'Active rewards',
    directions: [
      { value: 'desc', label: 'Most first' },
      { value: 'asc', label: 'Fewest first' },
    ],
  },
];

export const POOL_COMPARATORS: Record<
  PoolSortKey,
  (a: RewardPool, b: RewardPool) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'rewards-desc': (a, b) => b.active_reward_count - a.active_reward_count,
  'rewards-asc': (a, b) => a.active_reward_count - b.active_reward_count,
};

export function derivePoolSortKey(sortTile: SortTile | null): PoolSortKey {
  if (!sortTile) return 'name-asc';
  if (sortTile.fieldId === 'rewards') {
    return sortTile.direction === 'asc' ? 'rewards-asc' : 'rewards-desc';
  }
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesPoolQuery(pool: RewardPool, query: string): boolean {
  return (
    pool.name.toLowerCase().includes(query) ||
    (pool.description ?? '').toLowerCase().includes(query) ||
    pool.rewards.some((reward) => reward.label.toLowerCase().includes(query))
  );
}

export function applyPoolFilters(
  pools: RewardPool[],
  tiles: FilterTile[]
): RewardPool[] {
  let result = pools;

  for (const tile of tiles) {
    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((pool) => pool.is_active === wantActive);
    }

    if (tile.fieldId === 'usage' && typeof tile.value === 'string') {
      const wantUsed = tile.value === 'used';
      result = result.filter((pool) => pool.promos.length > 0 === wantUsed);
    }
  }

  return result;
}

export const POOL_GROUP_BY_AXES: GroupByAxis<RewardPool>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (pool) => (pool.is_active ? 'Active' : 'Inactive'),
  },
  {
    id: 'usage',
    label: 'Promo usage',
    columns: ['Used by a promo', 'Not used yet'],
    columnFor: (pool) =>
      pool.promos.length > 0 ? 'Used by a promo' : 'Not used yet',
  },
];
