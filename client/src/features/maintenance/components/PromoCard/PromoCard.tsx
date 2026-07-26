import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { getPromoTiming } from '../../utils/promoTiming';
import type { Promo, PromoBranchScope } from '../../maintenance.types';
import styles from './PromoCard.module.css';

const BRANCH_SCOPE_LABELS: Record<PromoBranchScope, string> = {
  makati: 'Makati',
  southwoods: 'Southwoods',
  both: 'Both branches',
};

const TIMING_LABELS = {
  Upcoming: 'Upcoming',
  Active: 'Active now',
  Ended: 'Ended',
} as const;

interface PromoCardProps {
  promo: Promo;
  onToggle: (isActive: boolean) => void;
  onEdit: () => void;
}

/**
 * Card layout for the Promos subpage, matching the Discount Management
 * overhaul's DiscountCard - name, branch scope + timing badges, value,
 * window, and active/inactive status at a glance.
 */
export function PromoCard({ promo, onToggle, onEdit }: PromoCardProps) {
  const formattedValue =
    promo.discount_type === 'Percentage'
      ? `${promo.value}% off`
      : `PHP ${promo.value.toFixed(2)} off`;

  const windowText = promo.condition_note
    ? promo.condition_note
    : promo.start_date && promo.end_date
      ? `${promo.start_date} to ${promo.end_date}`
      : 'No window set';

  const timing = getPromoTiming(promo);

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{promo.name}</h3>
        <StatusBadge isActive={promo.is_active} />
      </div>

      <div className={styles.badges}>
        <span className={styles.branchBadge}>
          {BRANCH_SCOPE_LABELS[promo.branch_scope]}
        </span>
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
      </div>
    </article>
  );
}
