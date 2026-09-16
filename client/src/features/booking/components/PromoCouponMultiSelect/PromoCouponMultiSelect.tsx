import { useMemo } from 'react';
import type { Promo } from '../../../maintenance/maintenance.types';
import type {
  CustomerCoupon,
  DiscountValueType,
} from '../../../rewards/rewards.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import type { SortOption } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import styles from './PromoCouponMultiSelect.module.css';

export interface PromoCap {
  cap_type: 'percentage' | 'flat' | 'count';
  cap_value: number;
}

function promoLabel(promo: Promo): string {
  const amount =
    promo.discount_type === 'Percentage'
      ? `${promo.value}%`
      : `PHP ${promo.value.toFixed(2)}`;
  return `${promo.name} (${amount})`;
}

function couponLabel(coupon: CustomerCoupon): string {
  return coupon.discount_type === 'Percentage'
    ? `${coupon.value}% off coupon`
    : `PHP ${coupon.value.toFixed(2)} off coupon`;
}

/** Mirrors CustomerBookingFlowPage's own promoCouponCandidates math so "best
 * discount" ranks items by what they'd actually save on this booking, not
 * just their raw percentage/flat value. */
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
  if (daysLeft <= 0) return 'Expires today';
  if (daysLeft === 1) return 'Expires tomorrow';
  return `Expires in ${daysLeft} days`;
}

type SortKey = 'bestDiscount' | 'expiringSoon';

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { value: 'bestDiscount', label: 'Best discount' },
  { value: 'expiringSoon', label: 'Expiring soonest' },
];

interface ListItem {
  id: string;
  kind: 'promo' | 'coupon';
  label: string;
  amount: number;
  expiresAt: string | null;
}

interface PromoCouponMultiSelectProps {
  promos: Promo[];
  coupons: CustomerCoupon[];
  selectedPromoIds: string[];
  selectedCouponIds: string[];
  onTogglePromo: (promoId: string) => void;
  onToggleCoupon: (couponId: string) => void;
  cap: PromoCap;
  /** Total already-applied (capped) discount, for the running total shown
   * at the bottom - computed by the page (applyPromoCap), not this
   * component, so the exact-same math backs both this preview and the
   * Review step's own summary line. */
  cappedTotal: number;
  /** Combined pre-discount total of every booking in the group - used only
   * to estimate each promo/coupon's savings for the "Best discount" sort;
   * the authoritative capped total still comes from cappedTotal above. */
  groupSubtotal: number;
}

/**
 * Promos & Coupons multiselect booking step (session 86) - a searchable,
 * sortable checkbox list over every currently-applicable promo AND the
 * acting customer's own unredeemed coupons, combined into one list so they
 * can be ranked against each other by estimated savings or by how soon they
 * expire. Respects promo_cap_configuration (a 'count' cap disables further
 * checkboxes once the limit is already selected; a 'percentage'/'flat' cap
 * is reflected in cappedTotal, computed by the caller). The server
 * re-validates and re-caps every selection authoritatively at submit - this
 * is a preview only.
 */
export function PromoCouponMultiSelect({
  promos,
  coupons,
  selectedPromoIds,
  selectedCouponIds,
  onTogglePromo,
  onToggleCoupon,
  cap,
  cappedTotal,
  groupSubtotal,
}: PromoCouponMultiSelectProps) {
  const selectedCount = selectedPromoIds.length + selectedCouponIds.length;
  const isCountCapReached =
    cap.cap_type === 'count' && selectedCount >= cap.cap_value;

  const items = useMemo<ListItem[]>(() => {
    const promoItems: ListItem[] = promos.map((promo) => ({
      id: promo.id,
      kind: 'promo',
      label: promoLabel(promo),
      amount: estimatedSavings(promo.discount_type, promo.value, groupSubtotal),
      expiresAt: promo.end_date,
    }));

    const couponItems: ListItem[] = coupons.map((coupon) => ({
      id: coupon.id,
      kind: 'coupon',
      label: couponLabel(coupon),
      amount: estimatedSavings(
        coupon.discount_type,
        coupon.value,
        groupSubtotal
      ),
      expiresAt: coupon.expires_at,
    }));

    return [...promoItems, ...couponItems];
  }, [promos, coupons, groupSubtotal]);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: visibleItems,
  } = useSearchAndSort<ListItem, SortKey>({
    items,
    matchesQuery: (item, query) => item.label.toLowerCase().includes(query),
    comparators: {
      bestDiscount: (a, b) => b.amount - a.amount,
      expiringSoon: (a, b) => {
        const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
        const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
        return aTime - bTime;
      },
    },
    initialSortKey: 'bestDiscount',
  });

  if (items.length === 0) {
    return (
      <p className={styles.copy}>
        No promos or coupons are currently available for this booking.
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.filterBar}>
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search promos & coupons..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </div>

      {visibleItems.length === 0 ? (
        <p className={styles.copy}>No promos or coupons match your search.</p>
      ) : (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Promos & Coupons</legend>
          {visibleItems.map((item) => {
            const checked =
              item.kind === 'promo'
                ? selectedPromoIds.includes(item.id)
                : selectedCouponIds.includes(item.id);
            const onToggle =
              item.kind === 'promo'
                ? () => onTogglePromo(item.id)
                : () => onToggleCoupon(item.id);

            return (
              <label key={`${item.kind}-${item.id}`} className={styles.option}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && isCountCapReached}
                  onChange={onToggle}
                />
                <span className={styles.optionText}>
                  <span className={styles.kindTag}>
                    {item.kind === 'promo' ? 'Promo' : 'Coupon'}
                  </span>
                  {item.label}
                  <span className={styles.expiry}>
                    {formatTimeRemaining(item.expiresAt)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {isCountCapReached ? (
        <p className={styles.copy}>
          You've reached the maximum number of promos/coupons that can be
          combined ({cap.cap_value}).
        </p>
      ) : null}

      <p className={styles.total}>You'll save PHP {cappedTotal.toFixed(2)}.</p>
    </div>
  );
}
