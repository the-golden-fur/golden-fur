import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getCustomerProfile } from '../../api/customer.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { listCreditBalances, listCreditHistory } from '../../../credits/api/credits.api';
import type {
  CreditBalance,
  CreditTransaction,
} from '../../../credits/credits.types';
import { CreditBalanceCard } from '../../../credits/components/CreditBalanceCard/CreditBalanceCard';
import styles from './CustomerPortalPage.module.css';

/**
 * The customer portal home (`/portal`, the Navbar brand link's destination)
 * - previously a tile grid linking to Book a Service/My Bookings/Pet
 * Manager/Settings, now redundant with the Sidebar (AppShell), which
 * already links to all of those (customerPortal.config.ts). Beyond the
 * welcome message, this is also where #95 surfaces the customer's own
 * credit balance (self-read via GET /credits/balances with no customer_id -
 * resolves to the caller) - one card per branch with a nonzero balance,
 * since credit is branch-locked and there's no cross-branch total to show.
 */
export function CustomerPortalPage() {
  const { user, accessToken } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [balances, setBalances] = useState<CreditBalance[]>([]);
  const [historyByBranch, setHistoryByBranch] = useState<
    Record<string, CreditTransaction[]>
  >({});

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

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    void listCreditBalances(accessToken).then((result) => {
      if (!isMounted || !result.data) return;

      const withBalance = result.data.filter((balance) => balance.balance > 0);
      setBalances(withBalance);

      for (const balance of withBalance) {
        void listCreditHistory(accessToken, balance.branch_id).then(
          (historyResult) => {
            if (!isMounted || !historyResult.data) return;
            setHistoryByBranch((prev) => ({
              ...prev,
              [balance.branch_id]: historyResult.data!,
            }));
          }
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Unknown branch';

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>
        Welcome back{fullName ? `, ${fullName}` : ''}!
      </h1>
      <p className={styles.copy}>Find everything you need in the sidebar.</p>

      {balances.length > 0 ? (
        <div className={styles.creditSection}>
          {balances.map((balance) => (
            <CreditBalanceCard
              key={balance.id}
              balance={balance}
              branchName={branchName(balance.branch_id)}
              history={historyByBranch[balance.branch_id] ?? []}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}
