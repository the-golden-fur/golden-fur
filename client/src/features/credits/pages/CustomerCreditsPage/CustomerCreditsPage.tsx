import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { listCreditHistory } from '../../api/credits.api';
import type { CreditTransaction } from '../../credits.types';
import { CreditBalanceCard } from '../../components/CreditBalanceCard/CreditBalanceCard';
import { CreditHistoryTable } from '../../components/CreditHistoryTable/CreditHistoryTable';
import { useCreditBalance } from '../../providers/useCreditBalance';
import {
  computeExpirySchedule,
  describeDaysLeft,
  formatExpiryDate,
} from '../../utils/expiry';
import styles from './CustomerCreditsPage.module.css';

/**
 * The customer's dedicated account-credit page (/portal/credits, the navbar
 * wallet pill's destination). Credit is branch-locked - one section per
 * branch the customer has a balance at - showing the balance, the soonest
 * expiry, an expandable full expiry schedule, and the raw ledger.
 *
 * Balances come from the shared CreditBalanceProvider (same fetch the navbar
 * pill reads); per-branch history is pulled here so the expiry schedule is
 * exact.
 */
export function CustomerCreditsPage() {
  const { accessToken } = useAuth();
  const { balances, total, isLoading } = useCreditBalance();

  const funded = useMemo(
    () => balances.filter((balance) => balance.balance > 0),
    [balances]
  );
  const branchKey = useMemo(
    () =>
      funded
        .map((balance) => balance.branch_id)
        .sort()
        .join(','),
    [funded]
  );

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [historyByBranch, setHistoryByBranch] = useState<
    Record<string, CreditTransaction[]>
  >({});
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  // Clock read once at mount (react-hooks/purity), like
  // ReceptionistBookingsQueuePage's date state.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    void listBranches().then((result) => {
      if (active && result.data) setBranches(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || funded.length === 0) return;
    let active = true;
    for (const balance of funded) {
      void listCreditHistory(accessToken, balance.branch_id).then((result) => {
        if (!active || !result.data) return;
        setHistoryByBranch((prev) => ({
          ...prev,
          [balance.branch_id]: result.data!,
        }));
      });
    }
    return () => {
      active = false;
    };
    // branchKey + total stand in for "the set or size of my balances changed";
    // funded is a fresh array every poll and would refetch needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchKey, total]);

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Branch credit';

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Account Credit</h1>

      {isLoading && funded.length === 0 ? (
        <p className={styles.copy}>Loading your credit...</p>
      ) : funded.length === 0 ? (
        <p className={styles.copy}>
          You don&apos;t have any account credit right now. Credit is added when
          you cancel a booking within the allowed notice period, and can be
          spent on a future visit to the same branch.
        </p>
      ) : (
        <>
          <p className={styles.copy}>
            You have <strong>{formatCurrency(total)}</strong> in account credit
            across {funded.length} {funded.length === 1 ? 'branch' : 'branches'}
            . Credit is tied to the branch it was issued at and cannot be moved
            between branches.
          </p>

          <div className={styles.sections}>
            {funded.map((balance) => {
              const history = historyByBranch[balance.branch_id] ?? [];
              const isExpanded = expandedBranchId === balance.branch_id;
              const schedule = computeExpirySchedule(
                history,
                balance.balance,
                now
              );

              return (
                <section className={styles.branchSection} key={balance.id}>
                  <CreditBalanceCard
                    balance={balance}
                    branchName={branchName(balance.branch_id)}
                    history={history}
                  />

                  <button
                    type="button"
                    className={styles.toggle}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedBranchId(isExpanded ? null : balance.branch_id)
                    }
                  >
                    {isExpanded
                      ? 'Hide expiry schedule & history'
                      : 'Show expiry schedule & history'}
                  </button>

                  {isExpanded ? (
                    <div className={styles.detail}>
                      <h3 className={styles.detailHeading}>Expiry schedule</h3>
                      {schedule.length === 0 ? (
                        <p className={styles.copy}>
                          None of this credit expires.
                        </p>
                      ) : (
                        <ul className={styles.schedule}>
                          {schedule.map((entry) => (
                            <li
                              className={styles.scheduleRow}
                              key={entry.expiresAt}
                            >
                              <span className={styles.scheduleAmount}>
                                {formatCurrency(entry.amount)}
                              </span>
                              <span className={styles.scheduleDate}>
                                {formatExpiryDate(entry.expiresAt)}
                              </span>
                              <span className={styles.scheduleDays}>
                                {describeDaysLeft(entry.daysLeft)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <h3 className={styles.detailHeading}>History</h3>
                      <CreditHistoryTable history={history} />
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
