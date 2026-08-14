import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getTransactionHistory } from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import styles from './RecentTransactionsWidget.module.css';

interface RecentTransactionsWidgetProps {
  branches: BranchSummary[];
  accessToken: string;
}

const RECENT_LIMIT = 5;

function describeTransaction(transaction: TransactionRecord): string {
  if (transaction.transaction_type === 'miscellaneous_sale') {
    return transaction.misc_sale_description ?? 'Miscellaneous sale';
  }

  return transaction.bookings?.service_category
    ? `${transaction.bookings.service_category} payment`
    : 'Booking payment';
}

/**
 * Superadmin dashboard widget - most recent transactions across every
 * branch. GET /reports/transaction-history has no limit param and is
 * already sorted newest-first server-side, so this just slices the top 5
 * client-side; "View all" links out to the full page for anything more.
 */
export function RecentTransactionsWidget({
  branches,
  accessToken,
}: RecentTransactionsWidgetProps) {
  const [transactions, setTransactions] = useState<
    TransactionRecord[] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void getTransactionHistory({}, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setTransactions((result.data ?? []).slice(0, RECENT_LIMIT));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  function branchName(branchId: string): string {
    return (
      branches.find((branch) => branch.id === branchId)?.name ??
      'Unknown branch'
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Recent Transactions</h2>
        <Link
          to="/staff/reports/transaction-history"
          className={styles.viewAll}
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading transactions...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : !transactions || transactions.length === 0 ? (
        <p className={styles.copy}>No transactions yet.</p>
      ) : (
        <ul className={styles.list}>
          {transactions.map((transaction) => (
            <li key={transaction.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.description}>
                  {describeTransaction(transaction)}
                </span>
                <span className={styles.meta}>
                  {branchName(transaction.branch_id)} ·{' '}
                  {new Date(transaction.created_at).toLocaleDateString()}
                </span>
              </div>
              <span className={styles.amount}>
                ₱{transaction.total_amount.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
