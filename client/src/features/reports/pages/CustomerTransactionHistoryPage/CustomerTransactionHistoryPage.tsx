import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { getMyTransactionHistory } from '../../api/reports.api';
import { payTransactionWithCredit } from '../../../billing/api/billing.api';
import {
  addBalancePaymentForBooking,
  payForBooking,
} from '../../../booking/api/booking.api';
import type { TransactionRecord } from '../../reports.types';
import {
  payableBalances,
  type PayableBalance,
} from '../../utils/payableBalances';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
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

/** Modes a customer can pay a Pending transaction with. */
type PayMode = 'credit' | 'GCash' | 'Maya';

const PAY_MODES: Array<{ value: PayMode; label: string }> = [
  { value: 'credit', label: 'Account credit' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
];

function paymentChoiceLabel(record: TransactionRecord): string {
  if (record.payment_choice === 'downpayment') return 'Down payment';
  if (record.payment_choice === 'full') return 'Full payment';
  if (record.payment_choice === 'balance') return 'Balance payment';
  return '-';
}

function paymentStatusLabel(status: string): string {
  return status === 'Pending' ? 'Due payment' : status;
}

function isPayable(t: TransactionRecord): boolean {
  return (
    t.payment_status === 'Pending' &&
    t.transaction_type === 'booking_payment' &&
    Boolean(t.booking_id)
  );
}

/**
 * Custom change (P-1 roadmap item: transaction history visibility) - the
 * customer-facing counterpart to TransactionHistoryTable.tsx, reusing its
 * styles. Payment/transactions rework: this is where a customer pays an
 * outstanding charge - "Pay" on a Pending booking_payment row opens a modal
 * to choose account credit / GCash / Maya. Credit settles immediately;
 * GCash/Maya redirect to PayMongo.
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
  const [reloadKey, setReloadKey] = useState(0);

  const [pendingOnly, setPendingOnly] = useState(false);

  const [payTarget, setPayTarget] = useState<TransactionRecord | null>(null);
  const [payMode, setPayMode] = useState<PayMode>('credit');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [balanceTarget, setBalanceTarget] = useState<PayableBalance | null>(
    null
  );
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const openBalance = (target: PayableBalance) => {
    setBalanceTarget(target);
    setBalanceAmount('');
    setBalanceError(null);
  };

  const confirmBalance = async () => {
    if (!accessToken || !balanceTarget) return;
    const amount = Number(balanceAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBalanceError('Enter an amount greater than zero.');
      return;
    }
    if (amount > balanceTarget.remaining) {
      setBalanceError('That is more than the balance left on this booking.');
      return;
    }

    setBalanceSubmitting(true);
    setBalanceError(null);
    const result = await addBalancePaymentForBooking(
      balanceTarget.bookingId,
      amount,
      accessToken
    );
    setBalanceSubmitting(false);
    if (result.error) {
      setBalanceError(result.error);
      return;
    }
    setBalanceTarget(null);
    setReloadKey((k) => k + 1);
  };

  const openPay = (t: TransactionRecord) => {
    setPayTarget(t);
    setPayMode('credit');
    setPayError(null);
  };

  const confirmPay = async () => {
    if (!accessToken || !payTarget) return;
    setPaySubmitting(true);
    setPayError(null);

    if (payMode === 'credit') {
      const result = await payTransactionWithCredit(payTarget.id, accessToken);
      setPaySubmitting(false);
      if (result.error) {
        setPayError(result.error);
        return;
      }
      setPayTarget(null);
      setReloadKey((k) => k + 1);
      return;
    }

    // GCash / Maya - settle the booking's outstanding charge via PayMongo.
    const result = await payForBooking(
      payTarget.booking_id as string,
      accessToken,
      {
        payment_method: payMode,
        pay_in_full: payTarget.payment_choice !== 'downpayment',
      }
    );
    setPaySubmitting(false);
    if (result.error || !result.data) {
      setPayError(result.error ?? 'Could not start this payment.');
      return;
    }
    window.location.href = result.data.checkoutUrl;
  };

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
  }, [
    accessToken,
    dateFrom,
    dateTo,
    serviceCategory,
    paymentChoice,
    reloadKey,
  ]);

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

  const rows = pendingOnly
    ? visibleTransactions.filter((t) => t.payment_status === 'Pending')
    : visibleTransactions;

  const payable = payableBalances(transactions);

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
        <label className={styles.field}>
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => setPendingOnly(event.target.checked)}
          />{' '}
          Due payments only
        </label>
      </div>

      {payable.length > 0 ? (
        <div className={styles.filters}>
          {payable.map((item) => (
            <button
              key={item.bookingId}
              type="button"
              className={styles.secondaryButton}
              onClick={() => openBalance(item)}
            >
              Pay part of {item.serviceCategory} balance (
              {formatCurrency(item.remaining)} left)
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <p className={styles.copy}>Loading transactions...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
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
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.created_at).toLocaleDateString()}</td>
                <td>
                  {transaction.transaction_type === 'miscellaneous_sale'
                    ? transaction.misc_sale_description
                    : 'Booking payment'}
                </td>
                <td>{transaction.bookings?.service_category ?? '-'}</td>
                <td>{paymentChoiceLabel(transaction)}</td>
                <td>
                  {transaction.payment_status === 'Pending'
                    ? '—'
                    : transaction.payment_method}
                </td>
                <td>{paymentStatusLabel(transaction.payment_status)}</td>
                <td>PHP {transaction.total_amount.toFixed(2)}</td>
                <td>
                  {isPayable(transaction) ? (
                    <button
                      type="button"
                      className={styles.payButton}
                      onClick={() => openPay(transaction)}
                    >
                      Pay
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {payTarget ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-transaction-title"
          >
            <h2 id="pay-transaction-title" className={styles.modalTitle}>
              Pay PHP {payTarget.total_amount.toFixed(2)}
            </h2>

            <fieldset className={styles.modeGroup}>
              <legend>How would you like to pay?</legend>
              {PAY_MODES.map((mode) => (
                <label key={mode.value} className={styles.modeOption}>
                  <input
                    type="radio"
                    name="pay-mode"
                    checked={payMode === mode.value}
                    onChange={() => setPayMode(mode.value)}
                  />
                  {mode.label}
                </label>
              ))}
            </fieldset>

            {payError ? (
              <p className={styles.errorBanner} role="alert">
                {payError}
              </p>
            ) : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setPayTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.payButton}
                disabled={paySubmitting}
                onClick={() => void confirmPay()}
              >
                {paySubmitting
                  ? 'Processing...'
                  : payMode === 'credit'
                    ? 'Pay with credit'
                    : 'Continue to payment'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {balanceTarget ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="balance-payment-title"
          >
            <h2 id="balance-payment-title" className={styles.modalTitle}>
              Pay part of your balance
            </h2>
            <p className={styles.copy}>
              {formatCurrency(balanceTarget.remaining)} left on this{' '}
              {balanceTarget.serviceCategory} booking. Enter any amount up to
              that - you can pay the rest later.
            </p>

            <label className={styles.field}>
              Amount
              <input
                className={styles.control}
                type="number"
                min={1}
                max={balanceTarget.remaining}
                step="0.01"
                value={balanceAmount}
                onChange={(event) => setBalanceAmount(event.target.value)}
              />
            </label>

            {balanceError ? (
              <p className={styles.errorBanner} role="alert">
                {balanceError}
              </p>
            ) : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setBalanceTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.payButton}
                disabled={balanceSubmitting}
                onClick={() => void confirmBalance()}
              >
                {balanceSubmitting ? 'Adding...' : 'Add this payment'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
