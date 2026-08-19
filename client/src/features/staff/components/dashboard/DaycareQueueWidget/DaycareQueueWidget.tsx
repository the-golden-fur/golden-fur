import { useEffect, useState } from 'react';
import { listDaycareSessions } from '../../../../daycare/api/daycare.api';
import type { DaycareSession } from '../../../../daycare/daycare.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface DaycareQueueWidgetProps {
  accessToken: string;
}

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Superadmin dashboard widget - pets currently checked into Daycare,
 * reusing the same GET /daycare/sessions?status=Active endpoint
 * DaycareQueuePage's checkout tab draws from (scoped to the viewer's own
 * branch server-side, same as that page).
 */
export function DaycareQueueWidget({ accessToken }: DaycareQueueWidgetProps) {
  const [sessions, setSessions] = useState<DaycareSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listDaycareSessions(accessToken, { status: 'Active' }).then(
      (result) => {
        if (!isMounted) return;

        if (result.error || !result.data) {
          setError(result.error ?? 'Could not load the Daycare queue.');
          return;
        }

        setSessions(result.data);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const sorted = sessions
    ? [...sessions].sort(
        (a, b) =>
          new Date(b.check_in_at ?? 0).getTime() -
          new Date(a.check_in_at ?? 0).getTime()
      )
    : null;
  const latest = sorted?.[0];
  const latestTime = formatTime(latest?.check_in_at);

  return (
    <QueueWidgetCard
      title="Daycare Queue"
      to="/staff/daycare/queue"
      isLoading={sessions === null && !error}
      error={error}
      count={sorted?.length ?? 0}
      countLabel="checked in"
      emptyLabel="No pets currently in Daycare."
      latestLabel={latest && latestTime ? `Checked in ${latestTime}` : null}
    />
  );
}
