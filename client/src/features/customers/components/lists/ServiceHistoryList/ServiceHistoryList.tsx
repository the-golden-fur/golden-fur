import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { listPetServiceHistory } from '../../../api/customer.api';
import type {
  PetServiceHistoryEntry,
  PetServiceHistoryPayment,
} from '../../../customer.types';
import { BookingStatusBadge } from '../../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import {
  listBranchLetterheads,
  type BranchLetterhead,
} from '../../../../maintenance/api/maintenance.api';
import { paymentChoiceLabel } from '../../../../reports/components/TransactionHistoryTable/transactionDisplay';
import { receiptPropsFor } from '../../../../reports/components/TransactionHistoryTable/transactionReceipt';
import { TransactionReceiptPrintout } from '../../../../../shared/components/TransactionReceiptPrintout/TransactionReceiptPrintout';
import { formatCurrency } from '../../../../../shared/utils/formatCurrency';
import styles from './ServiceHistoryList.module.css';
import { LoadingState } from '../../../../../shared/components/LoadingState/LoadingState';

interface ServiceHistoryListProps {
  petId: string;
  accessToken: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * The pet's past bookings - Completed, Cancelled and No-show - newest first.
 * Read-only, same simple list shape as ConsultationResultList. A cancelled or
 * no-show booking's price is shown muted as "not charged" so it doesn't read
 * as money taken. Each paid payment behind a booking can be reprinted - the
 * same slip the Transactions page prints (see receiptPropsFor).
 */
export function ServiceHistoryList({
  petId,
  accessToken,
}: ServiceHistoryListProps) {
  const [entries, setEntries] = useState<PetServiceHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The payment whose receipt is being printed. Branches are only for its
  // letterhead.
  const [printing, setPrinting] = useState<PetServiceHistoryPayment | null>(
    null
  );
  const [branches, setBranches] = useState<Map<string, BranchLetterhead>>(
    () => new Map()
  );

  useEffect(() => {
    let isMounted = true;

    void listPetServiceHistory(petId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setEntries(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  useEffect(() => {
    let isMounted = true;

    void listBranchLetterheads().then((result) => {
      if (isMounted && result.data) {
        setBranches(new Map(result.data.map((branch) => [branch.id, branch])));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function printReceipt(payment: PetServiceHistoryPayment) {
    // The sheet has to be in the page before the print dialog opens, so its
    // render is flushed rather than left for the next paint.
    flushSync(() => setPrinting(payment));
    window.print();
  }

  if (isLoading) {
    return <LoadingState label="Loading service history..." />;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className={styles.copy}>No service history yet.</p>;
  }

  return (
    <>
      <ul className={styles.list}>
        {entries.map((entry) => {
          const isCompleted = entry.status === 'Completed';
          const where = [entry.branch_name, entry.staff_name]
            .filter(Boolean)
            .join(' · ');

          return (
            <li className={styles.item} key={entry.booking_id}>
              <div className={styles.header}>
                <span className={styles.date}>{formatDate(entry.date)}</span>
                <BookingStatusBadge status={entry.status} />
              </div>
              <div className={styles.summary}>
                <span className={styles.category}>
                  {entry.service_category}
                </span>
                <span
                  className={isCompleted ? styles.price : styles.priceMuted}
                >
                  {formatCurrency(entry.total_price)}
                  {isCompleted ? null : ' · not charged'}
                </span>
              </div>
              {entry.items.length > 0 ? (
                <p className={styles.items}>{entry.items.join(', ')}</p>
              ) : null}
              {where ? <p className={styles.meta}>{where}</p> : null}
              {!isCompleted && entry.cancellation_reason ? (
                <p className={styles.meta}>
                  Reason: {entry.cancellation_reason}
                </p>
              ) : null}
              {entry.payments.length > 0 ? (
                <ul
                  className={styles.payments}
                  aria-label={`Payments for ${entry.service_category} on ${formatShortDate(entry.date)}`}
                >
                  {entry.payments.map((payment) => (
                    <li className={styles.payment} key={payment.id}>
                      <span className={styles.paymentLabel}>
                        {payment.payment_choice
                          ? paymentChoiceLabel(payment)
                          : 'Payment'}
                      </span>
                      <span className={styles.paymentMeta}>
                        {formatCurrency(payment.total_amount)} ·{' '}
                        {formatShortDate(payment.created_at)}
                      </span>
                      <button
                        type="button"
                        className={styles.printButton}
                        onClick={() => printReceipt(payment)}
                      >
                        Print receipt
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {printing ? (
        <TransactionReceiptPrintout
          {...receiptPropsFor(printing, branches.get(printing.branch_id))}
          onDone={() => setPrinting(null)}
        />
      ) : null}
    </>
  );
}
