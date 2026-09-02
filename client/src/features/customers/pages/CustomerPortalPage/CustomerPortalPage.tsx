import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { useCreditBalance } from '../../../credits/providers/useCreditBalance';
import { getCustomerProfile } from '../../api/customer.api';
import styles from './CustomerPortalPage.module.css';

/**
 * The customer portal home (`/portal`, the Navbar brand link's destination).
 * Beyond the welcome message it shows a one-line account-credit summary that
 * links to the dedicated credits page (/portal/credits, CustomerCreditsPage)
 * - the per-branch cards + expiry schedule live there now, not here, so
 * there's a single home for that information.
 */
export function CustomerPortalPage() {
  const { user, accessToken } = useAuth();
  const { total, balances, isLoading } = useCreditBalance();
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void getCustomerProfile(user.id, accessToken).then((result) => {
      if (isMounted && result.data) {
        setFullName(result.data.full_name);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const fundedBranches = balances.filter(
    (balance) => balance.balance > 0
  ).length;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>
        Welcome back{fullName ? `, ${fullName}` : ''}!
      </h1>

      <p className={styles.copy}>Find everything you need in the sidebar.</p>

      {!isLoading && total > 0 ? (
        <Link to="/portal/credits" className={styles.creditSummary}>
          You have <strong>{formatCurrency(total)}</strong> in account credit
          across {fundedBranches} {fundedBranches === 1 ? 'branch' : 'branches'}{' '}
          — view credit details
        </Link>
      ) : null}
    </main>
  );
}
