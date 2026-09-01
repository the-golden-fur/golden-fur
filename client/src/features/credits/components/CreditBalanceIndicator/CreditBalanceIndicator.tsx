import { Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { useCreditBalance } from '../../providers/useCreditBalance';
import styles from './CreditBalanceIndicator.module.css';

/**
 * Navbar pill showing the signed-in customer's total account credit across
 * all branches, linking to the portal home where the per-branch cards live.
 * Always rendered (even at a zero balance) so customers discover the
 * feature - it shows the wallet icon plus the formatted total. Customer-only
 * - CustomerAuthGuard passes it as the Navbar's creditIndicator prop; staff
 * never get one.
 */
export function CreditBalanceIndicator() {
  const { total } = useCreditBalance();

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
