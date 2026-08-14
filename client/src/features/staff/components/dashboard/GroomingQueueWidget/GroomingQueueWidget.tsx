import { useEffect, useState } from 'react';
import { listGroomingQueue } from '../../../../grooming/api/grooming.api';
import type { GroomingSession } from '../../../../grooming/grooming.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface GroomingQueueWidgetProps {
  accessToken: string;
}

function queueSortPosition(session: GroomingSession): number {
  if (session.queue_position != null) return session.queue_position;
  return new Date(session.booking?.scheduled_start ?? 0).getTime();
}

function formatTime(iso: string | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Superadmin dashboard widget - today's Grooming queue at a glance, reusing
 * the same GET /grooming/queue endpoint GroomerDashboardPage itself calls
 * (scoped to the viewer's own branch server-side, same as that page).
 */
export function GroomingQueueWidget({ accessToken }: GroomingQueueWidgetProps) {
  const [sessions, setSessions] = useState<GroomingSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listGroomingQueue(accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the grooming queue.');
        return;
      }

      setSessions(result.data.sessions);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const sorted = sessions
    ? [...sessions].sort((a, b) => queueSortPosition(a) - queueSortPosition(b))
    : null;
  const next = sorted?.[0];
  const nextTime = formatTime(next?.booking?.scheduled_start);

  return (
    <QueueWidgetCard
      title="Grooming Queue"
      to="/staff/grooming/queue"
      isLoading={sessions === null && !error}
      error={error}
      count={sorted?.length ?? 0}
      countLabel="waiting"
      emptyLabel="No grooming appointments today."
      latestLabel={
        next
          ? `Next${nextTime ? ` at ${nextTime}` : ''}${
              next.booking?.status ? ` · ${next.booking.status}` : ''
            }`
          : null
      }
    />
  );
}
