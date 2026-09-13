import type { Promo } from '../../../maintenance/maintenance.types';
import type { CustomerCoupon } from '../../../rewards/rewards.types';
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
}

/**
 * Promos & Coupons multiselect booking step (session 86) - a checkbox list
 * over every currently-applicable promo AND the acting customer's own
 * unredeemed coupons, as one combined list. Respects promo_cap_configuration
 * (a 'count' cap disables further checkboxes once the limit is already
 * selected; a 'percentage'/'flat' cap is reflected in cappedTotal, computed
 * by the caller). The server re-validates and re-caps every selection
 * authoritatively at submit - this is a preview only.
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
}: PromoCouponMultiSelectProps) {
  const selectedCount = selectedPromoIds.length + selectedCouponIds.length;
  const isCountCapReached =
    cap.cap_type === 'count' && selectedCount >= cap.cap_value;

  if (promos.length === 0 && coupons.length === 0) {
    return (
      <p className={styles.copy}>
        No promos or coupons are currently available for this booking.
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      {promos.length > 0 ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Promos</legend>
          {promos.map((promo) => {
            const checked = selectedPromoIds.includes(promo.id);
            return (
              <label key={promo.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && isCountCapReached}
                  onChange={() => onTogglePromo(promo.id)}
                />
                {promoLabel(promo)}
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {coupons.length > 0 ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>My Coupons</legend>
          {coupons.map((coupon) => {
            const checked = selectedCouponIds.includes(coupon.id);
            return (
              <label key={coupon.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && isCountCapReached}
                  onChange={() => onToggleCoupon(coupon.id)}
                />
                {couponLabel(coupon)}
              </label>
            );
          })}
        </fieldset>
      ) : null}

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
