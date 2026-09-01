import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { getTransactionHistory } from '../../../reports/api/reports.api';
import type { TransactionRecord } from '../../../reports/reports.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { PaymentStatusBadge } from '../../../booking/components/shared/PaymentStatusBadge/PaymentStatusBadge';
import { PaymentMethodForm } from '../../components/PaymentMethodForm/PaymentMethodForm';
import type { PaymentFields } from '../../billing.types';
import {
  addBookingPayment,
  recordTransactionPayment,
} from '../../api/billing.api';
import styles from './TransactionsPage.module.css';

/** Money-handling staff - matches BILLING_STAFF_ROLES server-side. */
const ALLOWED_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
]);

function toPaymentStatus(
  raw: string
): 'Pending' | 'Partially Paid' | 'Fully Paid' {
  if (raw === 'Fully Paid' || raw === 'Partially Paid') return raw;
  return 'Pending';
}

/**
 * Settle individual booking-payment transactions at the counter. Replaces
 * the old Payments Queue (which marked whole bookings paid) - a booking can
 * carry several transactions (a down payment plus one or more balance
 * payments), each settled with its own method here.
 */
export function TransactionsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Record-payment modal
  const [payTarget, setPayTarget] = useState<TransactionRecord | null>(null);
  const [payFields, setPayFields] = useState<PaymentFields>({
    payment_method: 'Cash',
  });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add-balance-payment inline form, keyed by booking id
  const [addBookingId, setAddBookingId] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState('');

  useEffect(() => {
    if (!accessToken || !user?.id) return;
    let mounted = true;
    void listStaff(accessToken).then((result) => {
      if (!mounted) return;
      setRoleLoading(false);
      setViewerRole(result.data?.find((s) => s.id === user.id)?.role ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;
    void getTransactionHistory({}, accessToken).then((result) => {
      if (!mounted) return;
      setIsLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setTransactions(result.data ?? []);
    });
    return () => {
      mounted = false;
    };
  }, [accessToken, reloadKey]);

  const groups = useMemo(() => {
    const byBooking = new Map<string, TransactionRecord[]>();
    const misc: TransactionRecord[] = [];
    for (const t of transactions) {
      if (t.transaction_type === 'booking_payment' && t.booking_id) {
        const list = byBooking.get(t.booking_id) ?? [];
        list.push(t);
        byBooking.set(t.booking_id, list);
      } else {
        misc.push(t);
      }
    }
    return { byBooking, misc };
  }, [transactions]);

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.error} role="alert">
          Unable to load transactions.
        </p>
      </main>
    );
  }

  if (roleLoading) {
    return (
      <main className={styles.page}>
        <p>Loading...</p>
      </main>
    );
  }

  if (viewerRole === null || !ALLOWED_ROLES.has(viewerRole)) {
    return <Navigate to="/staff/settings" replace />;
  }

  const openPay = (t: TransactionRecord) => {
    setPayTarget(t);
    setPayFields({ payment_method: 'Cash' });
    setActionError(null);
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    setBusy(true);
    setActionError(null);
    const result = await recordTransactionPayment(
      payTarget.id,
      {
        payment_method: payFields.payment_method,
        bank_name: payFields.bank_name,
        payment_reference: payFields.payment_reference,
        cash_tendered: payFields.cash_tendered,
      },
      accessToken
    );
    setBusy(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setPayTarget(null);
    setReloadKey((k) => k + 1);
  };

  const confirmAddPayment = async (bookingId: string) => {
    const amount = Number(addAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError('Enter a positive amount.');
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await addBookingPayment(bookingId, amount, accessToken);
    setBusy(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setAddBookingId(null);
    setAddAmount('');
    setReloadKey((k) => k + 1);
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Transactions</h1>
      <p className={styles.copy}>
        Record a payment against any pending charge. A booking with a remaining
        balance can take more than one payment.
      </p>

      {isLoading ? <p>Loading transactions...</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && transactions.length === 0 ? (
        <p className={styles.copy}>No transactions yet.</p>
      ) : null}

      {Array.from(groups.byBooking.entries()).map(([bookingId, rows]) => {
        const category = rows[0]?.bookings?.service_category ?? 'Booking';
        const anyPending = rows.some((r) => r.payment_status === 'Pending');
        return (
          <section key={bookingId} className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={styles.groupTitle}>{category} booking</span>
            </div>
            <ul className={styles.rows}>
              {rows.map((t) => (
                <li key={t.id} className={styles.row}>
                  <span>
                    {new Date(t.created_at).toLocaleDateString()} ·{' '}
                    {formatCurrency(t.total_amount)}
                    {t.payment_choice ? ` · ${t.payment_choice}` : ''}
                  </span>
                  <span className={styles.rowRight}>
                    <PaymentStatusBadge
                      status={toPaymentStatus(t.payment_status)}
                      context="billing"
                    />
                    {t.payment_status === 'Pending' ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => openPay(t)}
                      >
                        Record payment
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {addBookingId === bookingId ? (
              <div className={styles.addRow}>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  placeholder="Amount"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={() => void confirmAddPayment(bookingId)}
                >
                  Add
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setAddBookingId(null)}
                >
                  Cancel
                </button>
              </div>
            ) : !anyPending ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setAddBookingId(bookingId);
                  setAddAmount('');
                  setActionError(null);
                }}
              >
                Add a payment
              </button>
            ) : null}
          </section>
        );
      })}

      {payTarget ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
          >
            <h2 id="record-payment-title" className={styles.modalTitle}>
              Record payment — {formatCurrency(payTarget.total_amount)}
            </h2>
            <PaymentMethodForm
              value={payFields}
              onChange={setPayFields}
              amountDue={payTarget.total_amount}
            />
            {actionError ? (
              <p className={styles.error} role="alert">
                {actionError}
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
                className={styles.primaryButton}
                disabled={busy}
                onClick={() => void confirmPay()}
              >
                {busy ? 'Recording...' : 'Record payment'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
