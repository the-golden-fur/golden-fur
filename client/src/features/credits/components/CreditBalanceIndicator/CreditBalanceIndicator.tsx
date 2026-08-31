import { Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { useCreditBalance } from '../../providers/useCreditBalance';
import styles from './CreditBalanceIndicator.module.css';

/**
 * Navbar pill showing the signed-in customer's total account credit across
 * all branches, linking to the portal home where the per-branch cards live.
 * Renders nothing when the total is zero (mirrors NotificationBell hiding its
 * badge at zero) so it never nags customers who have no credit. Customer-only
 * - CustomerAuthGuard passes it as the Navbar's creditIndicator prop; staff
 * never get one.
 */
export function CreditBalanceIndicator() {
  const { total, isLoading } = useCreditBalance();

  if (isLoading || total <= 0) {
    return null;
  }

  return (
    <Link
      to="/portal"
      className={styles.indicator}
      aria-label={`Account credit: ${formatCurrency(total)}`}
    >
      <Wallet size={18} aria-hidden="true" />
      <span className={styles.amount}>{formatCurrency(total)}</span>
    </Link>
  );
}
