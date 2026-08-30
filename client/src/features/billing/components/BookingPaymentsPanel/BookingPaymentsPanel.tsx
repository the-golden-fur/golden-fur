import { useEffect, useState } from 'react';
import { listBookingTransactions } from '../../api/billing.api';
import type { Transaction } from '../../billing.types';
import styles from './BookingPaymentsPanel.module.css';

interface BookingPaymentsPanelProps {
  bookingId: string;
  accessToken: string;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Every payment recorded against one booking (date, amount, full vs down
 * payment, method, status, reference), from
 * GET /billing/booking/:id/transactions.
 *
 * Extracted from PaymentsQueuePage's inline "View payments" panel (§6,
 * down-payment slot gate) so BookingDetailsPage shows the same thing -
 * the booking <-> transaction link, both directions. Self-fetching: mount
 * it (conditionally) where the payments should show; it handles its own
 * loading / error / empty states.
 */
export function BookingPaymentsPanel({
  bookingId,
  accessToken,
}: BookingPaymentsPanelProps) {
  // `loadedFor` pins the fetched rows to the booking they belong to, so a
  // bookingId change re-shows the loading state without a synchronous
  // setState reset in the effect body (react-hooks/set-state-in-effect).
  const [state, setState] = useState<{
    loadedFor: string | null;
    transactions: Transaction[];
    error: string | null;
  }>({ loadedFor: null, transactions: [], error: null });

  useEffect(() => {
    let isMounted = true;

    void listBookingTransactions(bookingId, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setState({
          loadedFor: bookingId,
          transactions: [],
          error: result.error ?? 'Could not load the payment history.',
        });
        return;
      }

      setState({
        loadedFor: bookingId,
        transactions: result.data,
        error: null,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [bookingId, accessToken]);

  const isLoading = state.loadedFor !== bookingId;
  const { transactions, error } = state;

  return (
    <div className={styles.paymentsPanel}>
      <p className={styles.paymentsPanelTitle}>Payments for this booking</p>

      {isLoading ? (
        <p className={styles.copy}>Loading payments...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : transactions.length === 0 ? (
        <p className={styles.copy}>
          No payments recorded yet for this booking.
        </p>
      ) : (
        <ul className={styles.paymentsList}>
          {transactions.map((transaction) => (
            <li key={transaction.id} className={styles.paymentRow}>
              <span className={styles.paymentAmount}>
                PHP {transaction.total_amount.toFixed(2)}
              </span>
              <span className={styles.paymentMeta}>
                {transaction.payment_choice === 'downpayment'
                  ? 'Down payment'
                  : 'Full payment'}{' '}
                · {transaction.payment_method} · {transaction.payment_status}
              </span>
              <span className={styles.paymentMeta}>
                {formatDateTime(transaction.created_at)}
                {transaction.payment_reference
                  ? ` · Ref ${transaction.payment_reference}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
