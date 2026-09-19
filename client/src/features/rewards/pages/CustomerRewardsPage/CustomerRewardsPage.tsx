import { useEffect, useMemo, useState } from 'react';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { formatRelativeTime } from '../../../../shared/utils/formatRelativeTime';
import {
  getMyCoupons,
  getMySpinCredits,
  listSpinWheelRewards,
  spinTheWheel,
} from '../../api/rewards.api';
import type { CustomerCoupon, SpinWheelReward } from '../../rewards.types';
import { SpinWheel } from '../../components/SpinWheel/SpinWheel';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import { DataTable, type DataTableColumn } from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { ViewSwitcher, type ViewSwitcherOption } from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  applyCouponFilters,
  COUPON_COMPARATORS,
  COUPON_FILTER_FIELDS,
  COUPON_GROUP_BY_AXES,
  COUPON_SORT_FIELDS,
  deriveCouponSortKey,
  findRewardForCoupon,
  matchesCouponQuery,
} from './couponBrowserFields';
import styles from './CustomerRewardsPage.module.css';

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function discountLabel(coupon: CustomerCoupon): string {
  return coupon.discount_type === 'Percentage'
    ? `${coupon.value}% off`
    : `${formatCurrency(coupon.value)} off`;
}

/** "My Rewards" (session 86) - spin-credit count, the spin wheel itself,
 * and the customer's coupon list (unused + already-used). */
export function CustomerRewardsPage() {
  const { accessToken } = useAuth();

  const [rewards, setRewards] = useState<SpinWheelReward[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [availableSpins, setAvailableSpins] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [resultRewardId, setResultRewardId] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId] = useState(COUPON_GROUP_BY_AXES[0].id);

  const refresh = () => {
    if (!accessToken) return;
    void Promise.all([
      listSpinWheelRewards(accessToken),
      getMyCoupons(accessToken),
      getMySpinCredits(accessToken),
    ]).then(([rewardsResult, couponsResult, creditsResult]) => {
      if (rewardsResult.data) setRewards(rewardsResult.data);
      if (couponsResult.data) setCoupons(couponsResult.data);
      if (creditsResult.data !== null) setAvailableSpins(creditsResult.data);
      setIsLoading(false);
    });
  };

  useEffect(refresh, [accessToken]);

  const handleSpin = async () => {
    if (!accessToken || availableSpins <= 0 || isSpinning) return;

    setIsSpinning(true);
    setMessage(null);

    const result = await spinTheWheel(accessToken);

    if (result.error || !result.data) {
      setIsSpinning(false);
      setMessage(result.error ?? 'Could not spin the wheel.');
      return;
    }

    setResultRewardId(result.data.rewardId);
  };

  const handleAnimationComplete = () => {
    setIsSpinning(false);
    setResultRewardId(null);
    setMessage('Coupon added to My Coupons!');
    refresh();
  };

  const visibleCoupons = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? coupons.filter((coupon) =>
          matchesCouponQuery(
            coupon,
            query,
            findRewardForCoupon(coupon, rewards)?.label ?? null
          )
        )
      : coupons;
    const filtered = applyCouponFilters(searched, filterTiles);

    if (!sortTile) {
      return [...filtered].sort(COUPON_COMPARATORS['obtained-newest']);
    }
    return [...filtered].sort(
      COUPON_COMPARATORS[deriveCouponSortKey(sortTile)]
    );
  }, [coupons, rewards, search, filterTiles, sortTile]);

  const activeGroupAxis =
    COUPON_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedCoupons = useGroupBy(
    visibleCoupons,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = COUPON_FILTER_FIELDS.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  function renderCouponContent(coupon: CustomerCoupon) {
    const reward = findRewardForCoupon(coupon, rewards);
    return (
      <>
        <span className={styles.couponDiscount}>{discountLabel(coupon)}</span>
        {reward ? <span className={styles.copy}>{reward.label}</span> : null}
        <span className={styles.copy}>
          Obtained {formatRelativeTime(coupon.created_at)}
        </span>
        <span className={styles.copy}>
          {coupon.expires_at
            ? `Expires ${new Date(coupon.expires_at).toLocaleDateString()}`
            : 'No expiry'}
        </span>
        <span className={styles.copy}>
          {coupon.is_redeemed ? 'Used' : 'Available'}
        </span>
      </>
    );
  }

  const couponColumns: DataTableColumn<CustomerCoupon>[] = [
    {
      id: 'discount',
      header: 'Discount',
      render: (coupon) => (
        <span className={styles.couponDiscount}>{discountLabel(coupon)}</span>
      ),
    },
    {
      id: 'reward',
      header: 'Reward',
      render: (coupon) => findRewardForCoupon(coupon, rewards)?.label ?? '—',
    },
    {
      id: 'obtained',
      header: 'Obtained',
      render: (coupon) => formatRelativeTime(coupon.created_at),
    },
    {
      id: 'expires',
      header: 'Expires',
      render: (coupon) =>
        coupon.expires_at
          ? new Date(coupon.expires_at).toLocaleDateString()
          : 'No expiry',
    },
    {
      id: 'status',
      header: 'Status',
      render: (coupon) => (coupon.is_redeemed ? 'Used' : 'Available'),
    },
  ];

  if (!accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load My Rewards.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>My Rewards</h1>

        <section className={styles.spinSection}>
          <p className={styles.spinCount}>
            You have <strong>{availableSpins}</strong> spin
            {availableSpins === 1 ? '' : 's'} available.
          </p>

          <SpinWheel
            rewards={rewards}
            resultRewardId={resultRewardId}
            onAnimationComplete={handleAnimationComplete}
          />

          <button
            type="button"
            className={styles.spinButton}
            onClick={() => void handleSpin()}
            disabled={availableSpins <= 0 || isSpinning}
          >
            {isSpinning ? 'Spinning...' : 'Spin the wheel'}
          </button>

          {message ? (
            <p className={styles.successBanner} role="status">
              {message}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>My Coupons</h2>

          {coupons.length === 0 ? (
            <p className={styles.copy}>
              No coupons yet - keep booking to earn a spin!
            </p>
          ) : (
            <>
              <FilterSortBar
                filterFields={COUPON_FILTER_FIELDS}
                filterTiles={filterTiles}
                onAddFilter={handleAddFilter}
                onChangeFilter={handleChangeFilter}
                onRemoveFilter={handleRemoveFilter}
                sortFields={COUPON_SORT_FIELDS}
                sortTile={sortTile}
                onChangeSort={setSortTile}
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search your coupons..."
              >
                <ViewSwitcher
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                  ariaLabel="Coupons view"
                />
              </FilterSortBar>

              {view === 'table' ? (
                <DataTable
                  columns={couponColumns}
                  rows={visibleCoupons}
                  getRowKey={(coupon) => coupon.id}
                  emptyMessage="No coupons match this filter."
                />
              ) : view === 'list' ? (
                <DataList
                  items={visibleCoupons}
                  getRowKey={(coupon) => coupon.id}
                  renderItem={(coupon) => (
                    <div className={styles.couponRowContent}>
                      {renderCouponContent(coupon)}
                    </div>
                  )}
                  emptyMessage="No coupons match this filter."
                />
              ) : (
                <DataBoard
                  groups={groupedCoupons}
                  getRowKey={(coupon) => coupon.id}
                  renderCard={(coupon) => (
                    <div
                      className={
                        coupon.is_redeemed
                          ? `${styles.couponCard} ${styles.couponUsed}`
                          : styles.couponCard
                      }
                    >
                      {renderCouponContent(coupon)}
                    </div>
                  )}
                  emptyColumnMessage="No coupons here."
                />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
