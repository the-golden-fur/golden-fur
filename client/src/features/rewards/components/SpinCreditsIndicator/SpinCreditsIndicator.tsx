import { Gift } from 'lucide-react';
import { Link } from 'react-router';
import { useSpinCredits } from '../../providers/useSpinCredits';
import styles from './SpinCreditsIndicator.module.css';

/**
 * Session 114: navbar chip showing how many coupon-wheel spins the signed-in
 * customer has waiting ("allow them to see how many spins they have") -
 * always visible, even at 0, and it links to My Rewards where every wheel
 * can be spun. The tooltip breaks the total down per promo. Customer-only,
 * rendered next to CreditBalanceIndicator by CustomerAuthGuard.
 */
export function SpinCreditsIndicator() {
  const { total, summary } = useSpinCredits();

  const label = `${total} spin${total === 1 ? '' : 's'} available`;
  const breakdown = summary.byPromo
    .map((group) => `${group.promoName}: ${group.count}`)
    .join('\n');

  return (
    <Link
      to="/portal/rewards"
      className={total > 0 ? `${styles.chip} ${styles.hasSpins}` : styles.chip}
      aria-label={label}
      title={breakdown ? `${label}\n${breakdown}` : label}
    >
      <Gift size={18} aria-hidden="true" />
      <span className={styles.count}>{total}</span>
    </Link>
  );
}
