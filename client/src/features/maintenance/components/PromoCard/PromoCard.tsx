import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { formatPromoValue, promoWindowText } from '../../utils/promoDisplay';
import { getPromoTiming } from '../../utils/promoTiming';
import type { Promo } from '../../maintenance.types';
import styles from './PromoCard.module.css';

const TIMING_LABELS = {
  Upcoming: 'Upcoming',
  Active: 'Active now',
  Ended: 'Ended',
} as const;

interface PromoCardProps {
  promo: Promo;
  onToggle: (isActive: boolean) => void;
  onEdit: () => void;
  onManageBranches: () => void;
  onArchive: () => void;
}

/**
 * Card layout for the Promos subpage, matching the Discount Management
 * overhaul's DiscountCard - name, timing badge, value, window, and
 * active/inactive status at a glance.
 *
 * Custom change (unify active/available): the old single branch-scope badge
 * ("Makati"/"Southwoods"/"Both branches") is gone now that a promo can span
 * any subset of branches - Branch Availability (its own action below,
 * mirroring Discounts/Services/Packages) is the source of truth for that,
 * same as this app already does everywhere else multi-branch. is_active
 * stays a real, separately-toggleable control here (unlike those four) -
 * see the Promo type's own doc comment on why.
 */
export function PromoCard({
  promo,
  onToggle,
  onEdit,
  onManageBranches,
  onArchive,
}: PromoCardProps) {
  const formattedValue = formatPromoValue(promo);
  const windowText = promoWindowText(promo);
  const timing = getPromoTiming(promo);
  // Session 114: a spin-wheel promo is customer-wide - no branch
  // availability to manage.
  const isSpinWheel = promo.promo_type === 'spin_wheel';

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{promo.name}</h3>
        <StatusBadge isActive={promo.is_active} />
      </div>

      <div className={styles.badges}>
        <span className={styles.timingBadge}>{TIMING_LABELS[timing]}</span>
      </div>

      <p className={styles.meta}>{formattedValue}</p>
      <p className={styles.meta}>{windowText}</p>

      <div className={styles.controls}>
        <ToggleSwitch
          label={`${promo.is_active ? 'Disable' : 'Enable'} ${promo.name}`}
          checked={promo.is_active}
          onChange={onToggle}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onEdit}
        >
          Edit
        </button>
        {!isSpinWheel ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onManageBranches}
          >
            Branch Availability
          </button>
        ) : null}
        {!promo.is_active ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onArchive}
          >
            Archive
          </button>
        ) : null}
      </div>
    </article>
  );
}
