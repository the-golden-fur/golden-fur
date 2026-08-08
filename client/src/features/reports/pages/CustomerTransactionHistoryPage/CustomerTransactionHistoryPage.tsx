import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMyTransactionHistory } from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import styles from '../../components/TransactionHistoryTable/TransactionHistoryTable.module.css';

const SERVICE_CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
];

/**
 * Custom change (P-1 roadmap item: transaction history visibility) - the
 * customer-facing counterpart to TransactionHistoryTable.tsx, reusing its
 * styles. No customer/pet picker (implicitly "me" - GET /reports/
 * my-transaction-history is always scoped server-side to the caller's own
 * customer_id), just date range and service type.
 */
export function CustomerTransactionHistoryPage() {
  const { accessToken } = useAuth();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serviceCategory, setServiceCategory] = useState('');

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void getMyTransactionHistory(
      {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        serviceCategory: serviceCategory || undefined,
      },
      accessToken
    ).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setTransactions(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, dateFrom, dateTo, serviceCategory]);

  if (!accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your transaction history.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Transaction History</h1>

      <div className={styles.filters}>
        <label className={styles.field}>
          From
          <input
            className={styles.control}
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          To
          <input
            className={styles.control}
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          Service type
          <select
            className={styles.control}
            value={serviceCategory}
            onChange={(event) => setServiceCategory(event.target.value)}
          >
            <option value="">All services</option>
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading transactions...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : transactions.length === 0 ? (
        <p className={styles.copy}>No transactions match these filters.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Service</th>
              <th>Payment Method</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.created_at).toLocaleDateString()}</td>
                <td>
                  {transaction.transaction_type === 'miscellaneous_sale'
                    ? transaction.misc_sale_description
                    : 'Booking payment'}
                </td>
                <td>{transaction.bookings?.service_category ?? '-'}</td>
                <td>{transaction.payment_method}</td>
                <td>{transaction.payment_status}</td>
                <td>₱{transaction.total_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
