import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { CustomerCoupon, SpinWheelReward } from '../../rewards.types';

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'used', label: 'Used' },
];

export const COUPON_FILTER_FIELDS: FilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'available',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
];

export type CouponSortKey =
  | 'expiry-soonest'
  | 'expiry-latest'
  | 'value-desc'
  | 'value-asc'
  | 'obtained-newest'
  | 'obtained-oldest';

export const COUPON_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'obtained',
    label: 'Obtained',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
  {
    id: 'expiry',
    label: 'Expiry',
    directions: [
      { value: 'asc', label: 'Soonest first' },
      { value: 'desc', label: 'Latest first' },
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
];

// Coupons with no expiry sort after every dated one, regardless of direction
// - "no expiry" isn't meaningfully "soonest" or "latest".
function expiryTime(coupon: CustomerCoupon): number {
  return coupon.expires_at ? new Date(coupon.expires_at).getTime() : Infinity;
}

export const COUPON_COMPARATORS: Record<
  CouponSortKey,
  (a: CustomerCoupon, b: CustomerCoupon) => number
> = {
  'expiry-soonest': (a, b) => expiryTime(a) - expiryTime(b),
  'expiry-latest': (a, b) => {
    const aTime = a.expires_at ? new Date(a.expires_at).getTime() : -Infinity;
    const bTime = b.expires_at ? new Date(b.expires_at).getTime() : -Infinity;
    return bTime - aTime;
  },
  'value-desc': (a, b) => b.value - a.value,
  'value-asc': (a, b) => a.value - b.value,
  'obtained-newest': (a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  'obtained-oldest': (a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
};

export function deriveCouponSortKey(sortTile: SortTile | null): CouponSortKey {
  if (!sortTile) return 'obtained-newest';
  if (sortTile.fieldId === 'expiry') {
    return sortTile.direction === 'desc' ? 'expiry-latest' : 'expiry-soonest';
  }
  if (sortTile.fieldId === 'value') {
    return sortTile.direction === 'asc' ? 'value-asc' : 'value-desc';
  }
  return sortTile.direction === 'asc' ? 'obtained-oldest' : 'obtained-newest';
}

/** Matches against the linked reward's label (when resolvable) as well as
 * the coupon's own discount description, so "10" or a reward name both
 * work as search terms. */
export function matchesCouponQuery(
  coupon: CustomerCoupon,
  query: string,
  rewardLabel: string | null
): boolean {
  const haystack = [
    rewardLabel ?? '',
    coupon.discount_type,
    String(coupon.value),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function applyCouponFilters(
  coupons: CustomerCoupon[],
  tiles: FilterTile[]
): CustomerCoupon[] {
  let result = coupons;

  for (const tile of tiles) {
    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantUsed = tile.value === 'used';
      result = result.filter((coupon) => coupon.is_redeemed === wantUsed);
    }
  }

  return result;
}

export const COUPON_GROUP_BY_AXES: GroupByAxis<CustomerCoupon>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Available', 'Used'],
    columnFor: (coupon) => (coupon.is_redeemed ? 'Used' : 'Available'),
  },
];

export function findRewardForCoupon(
  coupon: CustomerCoupon,
  rewards: SpinWheelReward[]
): SpinWheelReward | null {
  return (
    rewards.find((reward) => reward.id === coupon.spin_wheel_reward_id) ??
    null
  );
}
