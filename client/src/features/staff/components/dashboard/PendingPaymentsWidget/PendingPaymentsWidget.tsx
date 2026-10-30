import { useEffect, useState } from 'react';
import { getTransactionHistory } from '../../../../reports/api/reports.api';
import type { TransactionRecord } from '../../../../reports/reports.types';
import { isBookingCancelled } from '../../../../reports/components/TransactionHistoryTable/transactionDisplay';
import { formatCurrency } from '../../../../../shared/utils/formatCurrency';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface PendingPaymentsWidgetProps {
  accessToken: string;
}

/** Still waiting to be paid - and payable (a cancelled booking's leftover
 * charge can't take a payment, so it isn't work for the counter). */
function isPendingPayment(transaction: TransactionRecord): boolean {
  return (
    transaction.payment_status === 'Pending' && !isBookingCancelled(transaction)
  );
}

/**
 * Front Desk dashboard widget - the branch's transactions still waiting for
 * payment, as a QueueWidgetCard: how many, how much in total, and the one
 * that has waited longest. Clicking through opens the Transactions page,
 * where "Pay" settles them. Same GET /reports/transaction-history endpoint
 * as TransactionsWidget, which scopes the viewer to their own branch
 * server-side, so no branchId prop is needed.
 */
export function PendingPaymentsWidget({
  accessToken,
}: PendingPaymentsWidgetProps) {
  const [pending, setPending] = useState<TransactionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void getTransactionHistory({}, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load pending payments.');
        return;
      }

      setPending(result.data.filter(isPendingPayment));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const totalDue = (pending ?? []).reduce(
    (sum, transaction) => sum + Number(transaction.total_amount),
    0
  );
  const oldest = pending?.length
    ? [...pending].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    : null;

  return (
    <QueueWidgetCard
      title="Pending Payments"
      to="/staff/reports/transaction-history"
      isLoading={pending === null && !error}
      error={error}
      count={pending?.length ?? 0}
      countLabel={`due · ${formatCurrency(totalDue)}`}
      emptyLabel="No payments waiting."
      latestLabel={
        oldest
          ? `Oldest: ${oldest.customer_name ?? 'Unknown customer'} · ${formatCurrency(oldest.total_amount)}`
          : null
      }
    />
  );
}
