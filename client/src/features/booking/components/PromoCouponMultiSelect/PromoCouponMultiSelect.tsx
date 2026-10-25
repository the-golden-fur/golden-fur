import { useMemo } from 'react';
import type { Promo } from '../../../maintenance/maintenance.types';
import type {
  CustomerCoupon,
  DiscountValueType,
} from '../../../rewards/rewards.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import type { SortOption } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { promoMinSpendShortfall } from '../../utils/promoMinSpend';
import styles from './PromoCouponMultiSelect.module.css';

/** Search and sort only earn their space once the list is long. */
const SEARCH_THRESHOLD = 5;

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function valueLabel(discountType: DiscountValueType, value: number): string {
  return discountType === 'Percentage'
    ? `${value}% off`
    : `${formatPeso(value)} off`;
}

/** Mirrors CustomerBookingFlowPage's own promoCouponCandidates math, so each
 * row shows what it would actually take off this booking. */
function estimatedSavings(
  discountType: DiscountValueType,
  value: number,
  subtotal: number
): number {
  return discountType === 'Percentage'
    ? subtotal * (value / 100)
    : Math.min(value, subtotal);
}

function formatTimeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry';

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / msPerDay
  );
  if (daysLeft <= 0) return 'Ends today';
  if (daysLeft === 1) return 'Ends tomorrow';
  return `Ends in ${daysLeft} days`;
}

type SortKey = 'bestDiscount' | 'expiringSoon';

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { value: 'bestDiscount', label: 'Best savings' },
  { value: 'expiringSoon', label: 'Ending soonest' },
];

interface ListItem {
  id: string;
  kind: 'promo' | 'coupon';
  name: string;
  value: string;
  amount: number;
  expiresAt: string | null;
  /** PHP still needed to reach the promo's cap (minimum order) - 0 = usable. */
  shortfall: number;
  minSpend: number | null;
}

interface PromoCouponMultiSelectProps {
  promos: Promo[];
  coupons: CustomerCoupon[];
  selectedPromoIds: string[];
  selectedCouponIds: string[];
  onTogglePromo: (promoId: string) => void;
  onToggleCoupon: (couponId: string) => void;
  /** Clears whichever promo/coupon is picked. */
  onClear: () => void;
  /** What the picked promo/coupon takes off - computed by the page, so this
   * matches the Review summary exactly. */
  cappedTotal: number;
  /** Combined pre-discount total of every booking in the group - drives each
   * row's savings figure and the minimum-order check. */
  groupSubtotal: number;
  /** False while the coupon spin wheel (an experimental feature) is
   * switched off - the copy then talks about promos only. Defaults to true. */
  couponsEnabled?: boolean;
}

/**
 * Promos & Coupons on the booking flow's Review step: one choice per booking
 * (the server refuses more), so it's a radio list. Each row leads with what
 * it saves on THIS booking. A promo below its cap (minimum order) stays
 * visible but locked, saying how much more to add. The server re-validates
 * everything at submit - this is a preview only.
 */
export function PromoCouponMultiSelect({
  promos,
  coupons,
  selectedPromoIds,
  selectedCouponIds,
  onTogglePromo,
  onToggleCoupon,
  onClear,
  cappedTotal,
  groupSubtotal,
  couponsEnabled = true,
}: PromoCouponMultiSelectProps) {
  const copy = couponsEnabled
    ? {
        title: 'Promos & Coupons',
        rule: 'Use one promo or coupon per booking.',
        none: 'No promos or coupons are available for this booking right now.',
        search: 'Search promos & coupons...',
        noMatch: 'No promos or coupons match your search.',
      }
    : {
        title: 'Promos',
        rule: 'Use one promo per booking.',
        none: 'No promos are available for this booking right now.',
        search: 'Search promos...',
        noMatch: 'No promos match your search.',
      };

  const items = useMemo<ListItem[]>(() => {
    const promoItems: ListItem[] = promos.map((promo) => {
      const discountType = promo.discount_type ?? 'Flat';
      const value = Number(promo.value ?? 0);
      return {
        id: promo.id,
        kind: 'promo',
        name: promo.name,
        value: valueLabel(discountType, value),
        amount: estimatedSavings(discountType, value, groupSubtotal),
        expiresAt: promo.end_date,
        shortfall: promoMinSpendShortfall(promo, groupSubtotal),
        minSpend: promo.min_spend != null ? Number(promo.min_spend) : null,
      };
    });

    const couponItems: ListItem[] = coupons.map((coupon) => ({
      id: coupon.id,
      kind: 'coupon',
      name: valueLabel(coupon.discount_type, coupon.value) + ' coupon',
      // Already in the name - not repeated on the meta line.
      value: '',
      amount: estimatedSavings(
        coupon.discount_type,
        coupon.value,
        groupSubtotal
      ),
      expiresAt: coupon.expires_at,
      shortfall: 0,
      minSpend: null,
    }));

    return [...promoItems, ...couponItems];
  }, [promos, coupons, groupSubtotal]);

  // Locked rows always sink below the usable ones, whatever the sort.
  const lockedLast =
    (compare: (a: ListItem, b: ListItem) => number) =>
    (a: ListItem, b: ListItem) =>
      Number(a.shortfall > 0) - Number(b.shortfall > 0) || compare(a, b);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: visibleItems,
  } = useSearchAndSort<ListItem, SortKey>({
    items,
    matchesQuery: (item, query) => item.name.toLowerCase().includes(query),
    comparators: {
      bestDiscount: lockedLast((a, b) => b.amount - a.amount),
      expiringSoon: lockedLast((a, b) => {
        const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
        const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
        return aTime - bTime;
      }),
    },
    initialSortKey: 'bestDiscount',
  });

  const hasSelection = selectedPromoIds.length + selectedCouponIds.length > 0;

  return (
    <section className={styles.wrapper} aria-labelledby="promo-picker-title">
      <div className={styles.header}>
        <h3 id="promo-picker-title" className={styles.title}>
          {copy.title}
        </h3>
        <p className={styles.copy}>{copy.rule}</p>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>{copy.none}</p>
      ) : (
        <>
          {items.length > SEARCH_THRESHOLD ? (
            <SearchSortBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={copy.search}
              sortValue={sortKey}
              onSortChange={setSortKey}
              sortOptions={SORT_OPTIONS}
            />
          ) : null}

          <div
            className={styles.list}
            role="radiogroup"
            aria-labelledby="promo-picker-title"
          >
            {visibleItems.length === 0 ? (
              <p className={styles.empty}>{copy.noMatch}</p>
            ) : (
              visibleItems.map((item) => {
                const checked =
                  item.kind === 'promo'
                    ? selectedPromoIds.includes(item.id)
                    : selectedCouponIds.includes(item.id);
                const locked = item.shortfall > 0;
                const onSelect =
                  item.kind === 'promo'
                    ? () => onTogglePromo(item.id)
                    : () => onToggleCoupon(item.id);

                return (
                  <label
                    key={`${item.kind}-${item.id}`}
                    className={[
                      styles.row,
                      checked ? styles.rowSelected : '',
                      locked ? styles.rowLocked : '',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="promo-coupon"
                      className={styles.radio}
                      checked={checked}
                      disabled={locked}
                      // Re-clicking the picked row clears it, same as the
                      // "No promo" row below.
                      onClick={checked ? onClear : undefined}
                      onChange={onSelect}
                    />
                    <span className={styles.details}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.meta}>
                        <span className={styles.kindTag}>
                          {item.kind === 'promo' ? 'Promo' : 'Coupon'}
                        </span>
                        {locked && item.minSpend !== null ? (
                          <span className={styles.lockNote}>
                            Order {formatPeso(item.shortfall)} more to use (min.
                            order {formatPeso(item.minSpend)})
                          </span>
                        ) : (
                          <>
                            {item.value ? <span>{item.value}</span> : null}
                            {item.minSpend !== null ? (
                              <span>
                                Min. order {formatPeso(item.minSpend)}
                              </span>
                            ) : null}
                            <span>{formatTimeRemaining(item.expiresAt)}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className={styles.amount}>
                      −{formatPeso(item.amount)}
                    </span>
                  </label>
                );
              })
            )}

            <label
              className={[
                styles.row,
                styles.noneRow,
                !hasSelection ? styles.rowSelected : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name="promo-coupon"
                className={styles.radio}
                checked={!hasSelection}
                onChange={onClear}
              />
              <span className={styles.details}>
                <span className={styles.name}>No promo</span>
              </span>
            </label>
          </div>

          {hasSelection ? (
            <p className={styles.total}>
              You save <strong>{formatPeso(cappedTotal)}</strong>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
