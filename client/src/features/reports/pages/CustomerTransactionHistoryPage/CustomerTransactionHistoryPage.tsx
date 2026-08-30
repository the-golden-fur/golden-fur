import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
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

const PAYMENT_CHOICE_OPTIONS = [
  { value: '', label: 'Full & down payments' },
  { value: 'full', label: 'Full payment' },
  { value: 'downpayment', label: 'Down payment' },
];

type SortKey = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Sort: Date (newest)' },
  { value: 'oldest', label: 'Sort: Date (oldest)' },
  { value: 'amount-high', label: 'Sort: Amount (high to low)' },
  { value: 'amount-low', label: 'Sort: Amount (low to high)' },
];

function paymentChoiceLabel(record: TransactionRecord): string {
  if (record.payment_choice === 'downpayment') return 'Down payment';
  if (record.payment_choice === 'full') return 'Full payment';
  return '-';
}

function paymentStatusLabel(status: string): string {
  return status === 'Pending' ? 'Due payment' : status;
}

/**
 * Custom change (P-1 roadmap item: transaction history visibility) - the
 * customer-facing counterpart to TransactionHistoryTable.tsx, reusing its
 * styles. No customer/pet picker (implicitly "me" - GET /reports/
 * my-transaction-history is always scoped server-side to the caller's own
 * customer_id), just date range, service type, payment choice, and the same
 * client-side search + date/amount sort the staff view offers.
 */
export function CustomerTransactionHistoryPage() {
  const { accessToken } = useAuth();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serviceCategory, setServiceCategory] = useState('');
  const [paymentChoice, setPaymentChoice] = useState('');

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
        paymentChoice: paymentChoice || undefined,
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
  }, [accessToken, dateFrom, dateTo, serviceCategory, paymentChoice]);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: visibleTransactions,
  } = useSearchAndSort<TransactionRecord, SortKey>({
    items: transactions,
    matchesQuery: (record, query) =>
      (record.misc_sale_description ?? '').toLowerCase().includes(query) ||
      record.payment_method.toLowerCase().includes(query) ||
      record.payment_status.toLowerCase().includes(query) ||
      (record.bookings?.service_category ?? '').toLowerCase().includes(query),
    comparators: {
      newest: (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      oldest: (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      'amount-high': (a, b) => b.total_amount - a.total_amount,
      'amount-low': (a, b) => a.total_amount - b.total_amount,
    },
    initialSortKey: 'newest',
  });

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

        <label className={styles.field}>
          Payment
          <select
            className={styles.control}
            value={paymentChoice}
            onChange={(event) => setPaymentChoice(event.target.value)}
          >
            {PAYMENT_CHOICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.filters}>
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by method, status, service..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading transactions...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : visibleTransactions.length === 0 ? (
        <p className={styles.copy}>No transactions match these filters.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Service</th>
              <th>Payment</th>
              <th>Payment Method</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.created_at).toLocaleDateString()}</td>
                <td>
                  {transaction.transaction_type === 'miscellaneous_sale'
                    ? transaction.misc_sale_description
                    : 'Booking payment'}
                </td>
                <td>{transaction.bookings?.service_category ?? '-'}</td>
                <td>{paymentChoiceLabel(transaction)}</td>
                <td>{transaction.payment_method}</td>
                <td>{paymentStatusLabel(transaction.payment_status)}</td>
                <td>PHP {transaction.total_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
