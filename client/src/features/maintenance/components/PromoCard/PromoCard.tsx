import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
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
  onConfigure: () => void;
  onRename: () => void;
  onArchive: () => void;
}

/**
 * Card layout for the Promos subpage, matching the Discount Management
 * overhaul's DiscountCard - name, timing badge, value, window, and
 * active/inactive status at a glance.
 *
 * Configure / Rename / Archive is the whole action set: which branches a
 * promo is available at is edited inside Configure ("Available at"), and
 * there is no on/off toggle - Archive is the only way to switch a promo off,
 * and Restore the way back on.
 */
export function PromoCard({
  promo,
  onConfigure,
  onRename,
  onArchive,
}: PromoCardProps) {
  const formattedValue = formatPromoValue(promo);
  const windowText = promoWindowText(promo);
  const timing = getPromoTiming(promo);
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
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onConfigure}
        >
          Configure
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRename}
        >
          Rename
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onArchive}
        >
          Archive
        </button>
      </div>
    </article>
  );
}
