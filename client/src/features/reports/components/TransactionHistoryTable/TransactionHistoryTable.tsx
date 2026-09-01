import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { listStaff } from '../../../staff/api/staff.api';
import {
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { getTransactionHistory } from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import { PaymentMethodForm } from '../../../billing/components/PaymentMethodForm/PaymentMethodForm';
import type { PaymentFields } from '../../../billing/billing.types';
import {
  payTransactionWithCredit,
  recordTransactionPayment,
} from '../../../billing/api/billing.api';
import styles from './TransactionHistoryTable.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
]);

const SERVICE_CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
];

const TRANSACTION_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'booking_payment', label: 'Booking payment' },
  { value: 'miscellaneous_sale', label: 'Miscellaneous sale' },
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

/** DB stores 'Pending' for an unsettled online payment - "Due payment"
 * reads better next to "Partially Paid" / "Fully Paid". */
function paymentStatusLabel(status: string): string {
  return status === 'Pending' ? 'Due payment' : status;
}

/**
 * Issue #105: filterable transaction history - customer, pet, date range,
 * and service type (AC-2), all composable client-side form state driving
 * server-side query params against transactionHistory.service.ts (#102).
 *
 * Advisory follow-up ("search, filter and sort all customer transactions,
 * e.g. downpayment, full"): adds a transaction-type / payment-choice filter
 * (server-side), a free-text search + date/amount sort (client-side, via the
 * shared useSearchAndSort), and a link from each booking-payment row to the
 * booking it belongs to.
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
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const openPay = (t: TransactionRecord) => {
    setPayTarget(t);
    setPayFields({ payment_method: 'Cash' });
    setPayError(null);
  };

  const runPay = async (fn: () => Promise<{ error?: string | null }>) => {
    setPayBusy(true);
    setPayError(null);
    const result = await fn();
    setPayBusy(false);
    if (result.error) {
      setPayError(result.error);
      return;
    }
    setPayTarget(null);
    setReloadKey((k) => k + 1);
  };

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPetId, setSelectedPetId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serviceCategory, setServiceCategory] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [paymentChoice, setPaymentChoice] = useState('');

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Clearing pets/selectedPetId lives in this handler (a synchronous UI
  // event), not in the effect above, alongside the customer change itself -
  // resetting derived state from an effect body triggers cascading renders.
  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedPetId('');
    setPets([]);
  }

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void getTransactionHistory(
      {
        customerId: selectedCustomerId || undefined,
        petId: selectedPetId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        serviceCategory: serviceCategory || undefined,
        transactionType: transactionType || undefined,
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
    isAllowedViewer,
    selectedCustomerId,
    selectedPetId,
    dateFrom,
    dateTo,
    serviceCategory,
    transactionType,
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

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Transactions</h1>

      <div className={styles.filters}>
        <label className={styles.field}>
          Customer
          <select
            className={styles.control}
            value={selectedCustomerId}
            onChange={(event) => handleCustomerChange(event.target.value)}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Pet
          <select
            className={styles.control}
            value={selectedPetId}
            onChange={(event) => setSelectedPetId(event.target.value)}
            disabled={!selectedCustomerId}
          >
            <option value="">All pets</option>
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        </label>

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
          Transaction type
          <select
            className={styles.control}
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value)}
          >
            {TRANSACTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
              <th>Method</th>
              <th>Status</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((transaction) => {
              const canPay =
                transaction.payment_status === 'Pending' &&
                transaction.transaction_type === 'booking_payment' &&
                Boolean(transaction.booking_id);
              const menuItems = [
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
              return (
                <tr key={transaction.id}>
                  <td>
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
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
              Record payment — PHP {payTarget.total_amount.toFixed(2)}
            </h2>
            {/* The amount is locked to this transaction's own total - a
                'downpayment' or 'full' charge is settled as-is; a partial
                'balance' amount is chosen when the balance charge is created,
                not here. */}
            <PaymentMethodForm
              value={payFields}
              onChange={setPayFields}
              amountDue={payTarget.total_amount}
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
                className={styles.secondaryButton}
                disabled={payBusy}
                onClick={() =>
                  void runPay(() =>
                    payTransactionWithCredit(
                      payTarget.id,
                      accessToken as string
                    )
                  )
                }
              >
                Pay from account credit
              </button>
              <button
                type="button"
                className={styles.payButton}
                disabled={payBusy}
                onClick={() =>
                  void runPay(() =>
                    recordTransactionPayment(
                      payTarget.id,
                      {
                        payment_method: payFields.payment_method,
                        bank_name: payFields.bank_name,
                        payment_reference: payFields.payment_reference,
                        cash_tendered: payFields.cash_tendered,
                      },
                      accessToken as string
                    )
                  )
                }
              >
                {payBusy ? 'Processing...' : 'Record payment'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
