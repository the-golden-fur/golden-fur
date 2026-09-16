import { useEffect, useState } from 'react';
import { listBookings } from '../../../../booking/api/booking.api';
import type { Booking } from '../../../../booking/booking.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface AssessmentQueueWidgetProps {
  branchId: string;
  accessToken: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Receptionist dashboard widget - a QueueWidgetCard summary of
 * AssessmentQueuePage's own Pending Assessment-category bookings, scoped to
 * the viewer's branch the same way that page resolves it (GET /bookings has
 * no automatic branch scoping server-side).
 */
export function AssessmentQueueWidget({
  branchId,
  accessToken,
}: AssessmentQueueWidgetProps) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !branchId) return;

    let isMounted = true;

    void listBookings(accessToken, {
      branchId,
      serviceCategory: 'Assessment',
      status: 'Pending',
    }).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the assessment queue.');
        return;
      }

      setBookings(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId]);

  const sorted = bookings
    ? [...bookings].sort(
        (a, b) =>
          new Date(a.scheduled_start).getTime() -
          new Date(b.scheduled_start).getTime()
      )
    : null;
  const next = sorted?.[0];

  return (
    <QueueWidgetCard
      title="Assessment Queue"
      to="/staff/assessment/queue"
      isLoading={bookings === null && !error}
      error={error}
      count={sorted?.length ?? 0}
      countLabel="waiting"
      emptyLabel="No assessments pending."
      latestLabel={next ? `Next at ${formatTime(next.scheduled_start)}` : null}
    />
  );
}
