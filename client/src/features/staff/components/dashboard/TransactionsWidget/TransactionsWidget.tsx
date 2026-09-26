import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getTransactionHistory } from '../../../../reports/api/reports.api';
import type { TransactionRecord } from '../../../../reports/reports.types';
import { transactionTypeLabel } from '../../../../reports/components/TransactionHistoryTable/transactionDisplay';
import { PaymentStatusBadge } from '../../../../booking/components/shared/PaymentStatusBadge/PaymentStatusBadge';
import type { PaymentStatus } from '../../../../booking/booking.types';
import { formatCurrency } from '../../../../../shared/utils/formatCurrency';
import styles from './TransactionsWidget.module.css';

interface TransactionsWidgetProps {
  accessToken: string;
}

const RECENT_LIMIT = 6;

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function describe(transaction: TransactionRecord): string {
  return transaction.bookings?.service_category
    ? `${transaction.bookings.service_category} payment`
    : transactionTypeLabel(transaction);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return isToday(iso)
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Cashier dashboard widget - the viewer's branch transactions at a glance:
 * today's count and amount collected, how many are still due (the column a
 * cashier works to clear on the Transactions board), and the most recent
 * few. Same GET /reports/transaction-history endpoint as
 * TransactionHistoryPage, which scopes a Cashier to their own branch
 * server-side and returns newest-first - so, like the Superadmin's
 * RecentTransactionsWidget, this slices client-side.
 */
export function TransactionsWidget({ accessToken }: TransactionsWidgetProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void getTransactionHistory({}, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load transactions.');
        return;
      }

      setTransactions(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const today = (transactions ?? []).filter((t) => isToday(t.created_at));
  const collectedToday = today
    .filter((t) => t.payment_status !== 'Pending')
    .reduce((sum, t) => sum + Number(t.total_amount), 0);
  const dueCount = (transactions ?? []).filter(
    (t) => t.payment_status === 'Pending'
  ).length;
  const recent = (transactions ?? []).slice(0, RECENT_LIMIT);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Transactions</h2>
        <Link
          to="/staff/reports/transaction-history"
          className={styles.viewLink}
        >
          View all
        </Link>
      </div>

      {transactions === null && !error ? (
        <p className={styles.copy}>Loading transactions...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : (
        <>
          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt className={styles.statLabel}>Today</dt>
              <dd className={styles.statValue}>{today.length}</dd>
            </div>
            <div className={styles.stat}>
              <dt className={styles.statLabel}>Collected today</dt>
              <dd className={styles.statValue}>
                {formatCurrency(collectedToday)}
              </dd>
            </div>
            <div className={styles.stat}>
              <dt className={styles.statLabel}>Due payments</dt>
              <dd className={styles.statValue}>{dueCount}</dd>
            </div>
          </dl>

          <div>
            <h3 className={styles.subTitle}>Recent</h3>
            {recent.length === 0 ? (
              <p className={styles.copy}>No transactions yet.</p>
            ) : (
              <ul className={styles.list}>
                {recent.map((transaction) => (
                  <li key={transaction.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.description}>
                        {describe(transaction)}
                      </span>
                      <span className={styles.meta}>
                        {transaction.customer_name ?? 'Unknown customer'} ·{' '}
                        {formatWhen(transaction.created_at)}
                      </span>
                    </div>
                    <div className={styles.rowEnd}>
                      <span className={styles.amount}>
                        {formatCurrency(transaction.total_amount)}
                      </span>
                      <PaymentStatusBadge
                        status={transaction.payment_status as PaymentStatus}
                        context="billing"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
