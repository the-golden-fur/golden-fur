import { useEffect, useMemo, useState } from 'react';
import { Columns3, Table } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { ViewSwitcher } from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { getMyTransactionHistory } from '../../api/reports.api';
import { payTransactionWithCredit } from '../../../billing/api/billing.api';
import {
  addBalancePaymentForBooking,
  payForBooking,
} from '../../../booking/api/booking.api';
import { BookingDetailsModal } from '../../../booking/components/BookingDetailsModal/BookingDetailsModal';
import type { TransactionRecord } from '../../reports.types';
import {
  payableBalances,
  type PayableBalance,
} from '../../utils/payableBalances';
import { notifyCreditBalanceChanged } from '../../../credits/providers/creditBalanceEvents';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { TransactionBoard } from '../../components/TransactionHistoryTable/TransactionBoard';
import {
  COMPARATORS,
  CUSTOMER_FILTER_FIELDS,
  CUSTOMER_SORT_FIELDS,
  deriveServerParams,
  deriveSortKey,
  deriveStatusFilter,
} from '../../components/TransactionHistoryTable/transactionFilterFields';
import {
  paymentChoiceLabel,
  paymentStatusLabel,
  transactionTypeLabel,
} from '../../components/TransactionHistoryTable/transactionDisplay';
import styles from '../../components/TransactionHistoryTable/TransactionHistoryTable.module.css';

type ViewMode = 'table' | 'board';

/** Modes a customer can pay a Pending transaction with. */
type PayMode = 'credit' | 'GCash' | 'Maya';

const PAY_MODES: Array<{ value: PayMode; label: string }> = [
  { value: 'credit', label: 'Account credit' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
];

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
 * styles and (post-remaster) its Notion-style FilterSortBar + Board view.
 * "Pay" on a Pending booking_payment row opens a modal to choose account
 * credit / GCash / Maya. Credit settles immediately; GCash/Maya redirect to
 * PayMongo.
 */
export function CustomerTransactionHistoryPage() {
  const { accessToken } = useAuth();

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The booking whose full details are shown in the popup (null = closed).
  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(null);

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

  const serverFilterKey = useMemo(
    () => JSON.stringify(deriveServerParams(filterTiles)),
    [filterTiles]
  );
  const serverParams = useMemo(
    () => JSON.parse(serverFilterKey) as ReturnType<typeof deriveServerParams>,
    [serverFilterKey]
  );

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
      // Credit was just spent - refresh the navbar pill.
      notifyCreditBalanceChanged();
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
        dateFrom: serverParams.dateFrom,
        dateTo: serverParams.dateTo,
        serviceCategory: serverParams.serviceCategory,
        paymentChoice: serverParams.paymentChoice,
      },
      accessToken
    )
      .then((result) => {
        if (!isMounted) return;

        setIsLoading(false);

        if (result.error) {
          setError(result.error);
          return;
        }

        setError(null);
        setTransactions(result.data ?? []);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
        setError('Could not load your transactions. Please try again.');
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, serverParams, reloadKey]);

  function handleAddFilter(fieldId: string) {
    const field = CUSTOMER_FILTER_FIELDS.find((entry) => entry.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  const statusFilter = deriveStatusFilter(filterTiles);
  const sortKey = deriveSortKey(sortTile);

  const rows = useMemo(() => {
    let list = transactions;

    if (statusFilter) {
      list = list.filter((t) => t.payment_status === statusFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (t) =>
          (t.misc_sale_description ?? '').toLowerCase().includes(query) ||
          t.payment_method.toLowerCase().includes(query) ||
          t.payment_status.toLowerCase().includes(query) ||
          (t.bookings?.service_category ?? '').toLowerCase().includes(query)
      );
    }

    return [...list].sort(COMPARATORS[sortKey]);
  }, [transactions, statusFilter, search, sortKey]);

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

      <FilterSortBar
        filterFields={CUSTOMER_FILTER_FIELDS}
        filterTiles={filterTiles}
        onAddFilter={handleAddFilter}
        onChangeFilter={handleChangeFilter}
        onRemoveFilter={handleRemoveFilter}
        sortFields={CUSTOMER_SORT_FIELDS}
        sortTile={sortTile}
        onChangeSort={setSortTile}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by method, status, service..."
      >
        <ViewSwitcher
          ariaLabel="Transactions view"
          options={[
            { value: 'table', label: 'Table', icon: Table },
            { value: 'board', label: 'Board', icon: Columns3 },
          ]}
          value={view}
          onChange={setView}
        />
      </FilterSortBar>

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
      ) : view === 'board' ? (
        <TransactionBoard
          transactions={rows}
          showCustomer={false}
          onCardActivate={(transaction) => {
            if (transaction.booking_id) {
              setDetailsBookingId(transaction.booking_id);
            }
          }}
          renderActions={(transaction) =>
            isPayable(transaction) ? (
              <button
                type="button"
                className={styles.payButton}
                onClick={() => openPay(transaction)}
              >
                Pay
              </button>
            ) : null
          }
        />
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
            {rows.map((transaction) => {
              const bookingId = transaction.booking_id;
              const openDetails = () => {
                if (bookingId) setDetailsBookingId(bookingId);
              };
              return (
                <tr
                  key={transaction.id}
                  className={bookingId ? styles.clickableRow : undefined}
                  role={bookingId ? 'button' : undefined}
                  tabIndex={bookingId ? 0 : undefined}
                  aria-label={
                    bookingId
                      ? `View booking details for this ${
                          transaction.bookings?.service_category ?? ''
                        } transaction`.replace(/\s+/g, ' ')
                      : undefined
                  }
                  onClick={bookingId ? openDetails : undefined}
                  onKeyDown={
                    bookingId
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openDetails();
                          }
                        }
                      : undefined
                  }
                >
                  <td>
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
                  <td>{transactionTypeLabel(transaction)}</td>
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
                        onClick={(event) => {
                          // Don't also open the details popup underneath.
                          event.stopPropagation();
                          openPay(transaction);
                        }}
                      >
                        Pay
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
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

      <BookingDetailsModal
        bookingId={detailsBookingId}
        onClose={() => setDetailsBookingId(null)}
      />
    </main>
  );
}
