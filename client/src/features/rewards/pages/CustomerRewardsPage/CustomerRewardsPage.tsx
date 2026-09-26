import { useEffect, useMemo, useState } from 'react';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { formatRelativeTime } from '../../../../shared/utils/formatRelativeTime';
import {
  getMyCoupons,
  getPromoWheel,
  spinTheWheel,
} from '../../api/rewards.api';
import type { CustomerCoupon, PromoWheel } from '../../rewards.types';
import { SpinWheel } from '../../components/SpinWheel/SpinWheel';
import { notifySpinCreditsChanged } from '../../providers/spinCreditsEvents';
import { useSpinCredits } from '../../providers/useSpinCredits';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  applyCouponFilters,
  COUPON_COMPARATORS,
  COUPON_FILTER_FIELDS,
  COUPON_GROUP_BY_AXES,
  COUPON_SORT_FIELDS,
  deriveCouponSortKey,
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

/** "My Rewards" (session 86; per-promo wheels since session 114) - how many
 * spins the customer has waiting per spin-wheel promo, that promo's own
 * wheel (its reward pool, with each reward's rarity and % chance), and the
 * customer's coupon list (unused + already-used). Spins skipped in the
 * pop-up land here. */
export function CustomerRewardsPage() {
  const { accessToken } = useAuth();
  const { summary, total, refresh: refreshSpins } = useSpinCredits();

  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [wheel, setWheel] = useState<PromoWheel | null>(null);
  const [wheelError, setWheelError] = useState<string | null>(null);
  const [resultRewardId, setResultRewardId] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId] = useState(COUPON_GROUP_BY_AXES[0].id);

  const refreshCoupons = () => {
    if (!accessToken) return;
    void getMyCoupons(accessToken).then((result) => {
      if (result.data) setCoupons(result.data);
      setIsLoading(false);
    });
  };

  useEffect(refreshCoupons, [accessToken]);

  // While a spin is animating, stay on its wheel even if that promo's count
  // just dropped to 0; otherwise follow the picker (falling back to the
  // first promo that still has spins).
  const activePromoId =
    wheel && isSpinning
      ? wheel.promoId
      : summary.byPromo.some((group) => group.promoId === selectedPromoId)
        ? selectedPromoId
        : (summary.byPromo[0]?.promoId ?? null);

  const activeCount =
    summary.byPromo.find((group) => group.promoId === activePromoId)?.count ??
    0;

  useEffect(() => {
    if (!accessToken || !activePromoId) return;
    if (wheel?.promoId === activePromoId) return;

    let active = true;
    void getPromoWheel(accessToken, activePromoId).then((result) => {
      if (!active) return;
      if (result.error || !result.data) {
        setWheelError(result.error ?? 'Could not load this wheel.');
        return;
      }
      setWheelError(null);
      setWheel(result.data);
    });

    return () => {
      active = false;
    };
  }, [accessToken, activePromoId, wheel?.promoId]);

  const handleSpin = async () => {
    if (!accessToken || !activePromoId || activeCount <= 0 || isSpinning) {
      return;
    }

    setIsSpinning(true);
    setMessage(null);

    const result = await spinTheWheel(accessToken, { promoId: activePromoId });

    if (result.error || !result.data) {
      setIsSpinning(false);
      setMessage(result.error ?? 'Could not spin the wheel.');
      return;
    }

    setResultRewardId(result.data.rewardId);
  };

  const handleAnimationComplete = () => {
    const reward = wheel?.rewards.find((item) => item.id === resultRewardId);
    setIsSpinning(false);
    setResultRewardId(null);
    setMessage(
      reward
        ? `You won: ${reward.label}! Coupon added to My Coupons.`
        : 'Coupon added to My Coupons!'
    );
    refreshCoupons();
    refreshSpins();
    notifySpinCreditsChanged();
  };

  const visibleCoupons = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? coupons.filter((coupon) =>
          matchesCouponQuery(coupon, query, coupon.reward_label ?? null)
        )
      : coupons;
    const filtered = applyCouponFilters(searched, filterTiles);

    if (!sortTile) {
      return [...filtered].sort(COUPON_COMPARATORS['obtained-newest']);
    }
    return [...filtered].sort(
      COUPON_COMPARATORS[deriveCouponSortKey(sortTile)]
    );
  }, [coupons, search, filterTiles, sortTile]);

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
    return (
      <>
        <span className={styles.couponDiscount}>{discountLabel(coupon)}</span>
        {coupon.reward_label ? (
          <span className={styles.copy}>{coupon.reward_label}</span>
        ) : null}
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
      render: (coupon) => coupon.reward_label ?? '—',
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
            You have <strong>{total}</strong> spin
            {total === 1 ? '' : 's'} available.
          </p>

          {summary.byPromo.length > 1 ? (
            <div
              className={styles.promoPicker}
              role="group"
              aria-label="Choose a wheel"
            >
              {summary.byPromo.map((group) => (
                <button
                  key={group.promoId}
                  type="button"
                  className={
                    group.promoId === activePromoId
                      ? `${styles.promoPill} ${styles.promoPillActive}`
                      : styles.promoPill
                  }
                  aria-pressed={group.promoId === activePromoId}
                  onClick={() => setSelectedPromoId(group.promoId)}
                  disabled={isSpinning}
                >
                  {group.promoName} ×{group.count}
                </button>
              ))}
            </div>
          ) : summary.byPromo[0] ? (
            <p className={styles.copy}>{summary.byPromo[0].promoName}</p>
          ) : null}

          {total === 0 && !isSpinning ? (
            <p className={styles.copy}>
              No spins right now - keep booking and logging in to earn one!
            </p>
          ) : wheelError ? (
            <p className={styles.errorBanner} role="alert">
              {wheelError}
            </p>
          ) : wheel && wheel.promoId === activePromoId ? (
            <SpinWheel
              rewards={wheel.rewards}
              resultRewardId={resultRewardId}
              onAnimationComplete={handleAnimationComplete}
            />
          ) : (
            <p className={styles.copy}>Loading wheel...</p>
          )}

          <button
            type="button"
            className={styles.spinButton}
            onClick={() => void handleSpin()}
            disabled={
              activeCount <= 0 ||
              isSpinning ||
              !wheel ||
              wheel.rewards.length === 0
            }
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
              No coupons yet - spin a wheel to win one!
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
