import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Columns3, Table } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { ViewSwitcher } from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { listStaff } from '../../../staff/api/staff.api';
import {
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  getTransactionHistory,
  type TransactionHistoryFilters,
} from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import { PaymentMethodForm } from '../../../billing/components/PaymentMethodForm/PaymentMethodForm';
import {
  PAYMENT_METHODS,
  type PaymentFields,
} from '../../../billing/billing.types';
import {
  addBookingPayment,
  payTransactionWithCredit,
  recordTransactionPayment,
} from '../../../billing/api/billing.api';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import {
  payableBalances,
  type PayableBalance,
} from '../../utils/payableBalances';
import { TransactionBoard } from './TransactionBoard';
import {
  COMPARATORS,
  buildStaffFilterFields,
  deriveServerParams,
  deriveSortKey,
  deriveStatusFilter,
  STAFF_SORT_FIELDS,
} from './transactionFilterFields';
import {
  paymentChoiceLabel,
  paymentStatusLabel,
  transactionTypeLabel,
} from './transactionDisplay';
import styles from './TransactionHistoryTable.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
]);

/** The Record-payment modal lets a cashier settle straight from the
 * customer's account credit too (routed to the pay-with-credit endpoint),
 * on top of the usual counter methods. */
const PAY_MODAL_METHODS = [...PAYMENT_METHODS, 'Credit'] as const;

type ViewMode = 'table' | 'board';

/**
 * Issue #105 + advisory follow-up: search, filter and sort every customer
 * transaction, each linked to a booking. Remaster: the filter/sort controls
 * are now Notion-style tiles (one "Filter" + one "Sort" button spawn removable
 * pills - see FilterSortBar), there is a Customer column, and a Board view
 * grouped by payment status (how a cashier works the "Due payment" pile).
 */
export function TransactionHistoryTable() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);
  const [payTarget, setPayTarget] = useState<TransactionRecord | null>(null);
  const [payFields, setPayFields] = useState<PaymentFields>({
    payment_method: 'Cash',
  });
  const [payAmount, setPayAmount] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [balanceTarget, setBalanceTarget] = useState<PayableBalance | null>(
    null
  );
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customerTile = filterTiles.find((tile) => tile.fieldId === 'customer');
  const hasCustomerFilter = Boolean(customerTile);
  const selectedCustomerId =
    customerTile && typeof customerTile.value === 'string'
      ? customerTile.value
      : '';

  // Only re-fetch when a server-backed filter actually changes value - a
  // client-side tile (status) or a sort change must not trigger a round trip.
  const serverFilterKey = useMemo(
    () => JSON.stringify(deriveServerParams(filterTiles)),
    [filterTiles]
  );
  const serverParams = useMemo<TransactionHistoryFilters>(
    () => JSON.parse(serverFilterKey),
    [serverFilterKey]
  );

  const openBalance = (target: PayableBalance) => {
    setBalanceTarget(target);
    setBalanceAmount('');
    setBalanceError(null);
  };

  const confirmBalance = async () => {
    if (!balanceTarget || !accessToken) return;
    const amount = Number(balanceAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBalanceError('Enter an amount greater than zero.');
      return;
    }
    if (amount > balanceTarget.remaining) {
      setBalanceError('That is more than the balance left on this booking.');
      return;
    }
    setBalanceBusy(true);
    setBalanceError(null);
    const result = await addBookingPayment(
      balanceTarget.bookingId,
      amount,
      accessToken
    );
    setBalanceBusy(false);
    if (result.error) {
      setBalanceError(result.error);
      return;
    }
    setBalanceTarget(null);
    setReloadKey((k) => k + 1);
  };

  const openPay = (t: TransactionRecord) => {
    setPayTarget(t);
    setPayFields({
      payment_method: 'Cash',
      // Prefill the cash box with the amount due - the common case is the
      // customer handing over the exact amount.
      cash_tendered: t.total_amount,
    });
    setPayAmount(String(t.total_amount));
    setPayError(null);
  };

  // 'Credit' is a Transactions-page-only method (routed to the pay-with-credit
  // endpoint); it isn't a PaymentMethod, so compare as a string.
  const payIsCredit = (payFields.payment_method as string) === 'Credit';

  const confirmPay = async () => {
    if (!payTarget || !accessToken) return;

    const collecting = Number(payAmount);
    if (!Number.isFinite(collecting) || collecting <= 0) {
      setPayError('Enter an amount greater than zero.');
      return;
    }
    if (collecting > payTarget.total_amount + 0.001) {
      setPayError('Amount to collect cannot exceed the transaction total.');
      return;
    }

    setPayBusy(true);
    setPayError(null);

    const result = payIsCredit
      ? await payTransactionWithCredit(payTarget.id, accessToken)
      : await recordTransactionPayment(
          payTarget.id,
          {
            payment_method: payFields.payment_method,
            bank_name: payFields.bank_name,
            payment_reference: payFields.payment_reference,
            cash_tendered: payFields.cash_tendered,
            amount_applied:
              collecting < payTarget.total_amount ? collecting : undefined,
          },
          accessToken
        );

    setPayBusy(false);
    if (result.error) {
      setPayError(result.error);
      return;
    }
    setPayTarget(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    void listCustomers(accessToken).then((result) => {
      if (isMounted && result.data) setCustomers(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !selectedCustomerId) return;

    let isMounted = true;

    void listCustomerPets(selectedCustomerId, accessToken).then((result) => {
      if (isMounted && result.data) setPets(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, selectedCustomerId]);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void getTransactionHistory(serverParams, accessToken)
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
        setError('Could not load transactions. Please try again.');
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer, serverParams, reloadKey]);

  const filterFields = useMemo(
    () => buildStaffFilterFields({ customers, pets, hasCustomerFilter }),
    [customers, pets, hasCustomerFilter]
  );

  function handleAddFilter(fieldId: string) {
    const field = filterFields.find((entry) => entry.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => {
        if (tile.fieldId === fieldId) return { ...tile, value };
        // A different customer invalidates any pet already picked.
        if (fieldId === 'customer' && tile.fieldId === 'pet') {
          return { ...tile, value: '' };
        }
        return tile;
      })
    );
    if (fieldId === 'customer') setPets([]);
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) =>
      prev.filter((tile) => {
        if (tile.fieldId === fieldId) return false;
        // Removing the Customer filter also removes the now-orphaned Pet one.
        if (fieldId === 'customer' && tile.fieldId === 'pet') return false;
        return true;
      })
    );
    if (fieldId === 'customer') setPets([]);
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
          (t.customer_name ?? '').toLowerCase().includes(query) ||
          (t.misc_sale_description ?? '').toLowerCase().includes(query) ||
          t.payment_method.toLowerCase().includes(query) ||
          t.payment_status.toLowerCase().includes(query) ||
          (t.bookings?.service_category ?? '').toLowerCase().includes(query)
      );
    }

    return [...list].sort(COMPARATORS[sortKey]);
  }, [transactions, statusFilter, search, sortKey]);

  const payable = payableBalances(transactions);

  function buildMenuItems(
    transaction: TransactionRecord
  ): MoreOptionsMenuItem[] {
    const canPay =
      transaction.payment_status === 'Pending' &&
      transaction.transaction_type === 'booking_payment' &&
      Boolean(transaction.booking_id);
    return [
      ...(transaction.booking_id
        ? [
            {
              label: 'View booking',
              onSelect: () =>
                navigate(`/staff/bookings/${transaction.booking_id}`),
            },
          ]
        : []),
      ...(canPay
        ? [{ label: 'Pay', onSelect: () => openPay(transaction) }]
        : []),
    ];
  }

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Transactions</h1>

      <FilterSortBar
        filterFields={filterFields}
        filterTiles={filterTiles}
        onAddFilter={handleAddFilter}
        onChangeFilter={handleChangeFilter}
        onRemoveFilter={handleRemoveFilter}
        sortFields={STAFF_SORT_FIELDS}
        sortTile={sortTile}
        onChangeSort={setSortTile}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by customer, method, status..."
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
              Add {item.serviceCategory} balance payment (
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
          renderActions={(transaction) => {
            const items = buildMenuItems(transaction);
            return items.length > 0 ? (
              <MoreOptionsMenu
                label="Options for this transaction"
                items={items}
              />
            ) : null;
          }}
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Service</th>
              <th>Payment</th>
              <th>Method</th>
              <th>Status</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((transaction) => {
              const menuItems = buildMenuItems(transaction);
              return (
                <tr key={transaction.id}>
                  <td>
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
                  <td>{transaction.customer_name ?? '—'}</td>
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
                    {menuItems.length > 0 ? (
                      <MoreOptionsMenu
                        label={`Options for this transaction`}
                        items={menuItems}
                      />
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
            aria-labelledby="record-payment-title"
          >
            <h2 id="record-payment-title" className={styles.modalTitle}>
              Mark as paid — PHP {payTarget.total_amount.toFixed(2)}
            </h2>
            {payIsCredit ? null : (
              <label className={styles.field}>
                Amount to collect (PHP)
                <input
                  className={styles.control}
                  type="number"
                  min={0.01}
                  max={payTarget.total_amount}
                  step="0.01"
                  value={payAmount}
                  onChange={(event) => setPayAmount(event.target.value)}
                />
              </label>
            )}
            {!payIsCredit &&
            Number(payAmount) > 0 &&
            Number(payAmount) < payTarget.total_amount ? (
              <p className={styles.copy}>
                A PHP {(payTarget.total_amount - Number(payAmount)).toFixed(2)}{' '}
                balance payment will be created for the rest.
              </p>
            ) : null}
            <PaymentMethodForm
              value={payFields}
              onChange={setPayFields}
              amountDue={Number(payAmount) || payTarget.total_amount}
              methods={PAY_MODAL_METHODS}
            />
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
                disabled={payBusy}
                onClick={() => void confirmPay()}
              >
                {payBusy ? 'Processing...' : 'Mark as paid'}
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
            aria-labelledby="add-balance-title"
          >
            <h2 id="add-balance-title" className={styles.modalTitle}>
              Add a balance payment
            </h2>
            <p className={styles.copy}>
              {formatCurrency(balanceTarget.remaining)} left on this{' '}
              {balanceTarget.serviceCategory} booking. This creates a new due
              payment for the amount entered, which is then settled like any
              other.
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
                disabled={balanceBusy}
                onClick={() => void confirmBalance()}
              >
                {balanceBusy ? 'Adding...' : 'Add payment'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
