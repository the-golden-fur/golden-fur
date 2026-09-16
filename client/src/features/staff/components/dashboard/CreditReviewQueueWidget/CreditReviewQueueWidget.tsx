import { useEffect, useState } from 'react';
import { listPendingCreditReviews } from '../../../../booking/api/booking.api';
import type { CreditReviewQueueItem } from '../../../../booking/booking.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface CreditReviewQueueWidgetProps {
  accessToken: string;
}

/**
 * Receptionist dashboard widget - a QueueWidgetCard summary of
 * CreditReviewQueuePage's pending cancellation_logs rows. Unlike the
 * bookings/assessment widgets, GET /cancellation-logs/pending-credit-review
 * already scopes to the requester's own branch server-side (Superadmin
 * only gets the unscoped view), so no branchId prop is needed here.
 */
export function CreditReviewQueueWidget({
  accessToken,
}: CreditReviewQueueWidgetProps) {
  const [items, setItems] = useState<CreditReviewQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listPendingCreditReviews(accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the credit review queue.');
        return;
      }

      setItems(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const sorted = items
    ? [...items].sort(
        (a, b) => b.potential_credit_amount - a.potential_credit_amount
      )
    : null;
  const next = sorted?.[0];

  return (
    <QueueWidgetCard
      title="Credit Review Queue"
      to="/staff/bookings/credit-review-queue"
      isLoading={items === null && !error}
      error={error}
      count={sorted?.length ?? 0}
      countLabel="pending"
      emptyLabel="No credit reviews pending."
      latestLabel={
        next
          ? `Largest: PHP ${next.potential_credit_amount.toFixed(2)}`
          : null
      }
    />
  );
}
