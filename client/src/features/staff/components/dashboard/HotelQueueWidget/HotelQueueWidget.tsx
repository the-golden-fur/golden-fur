import { useEffect, useState } from 'react';
import { listHotelStays } from '../../../../hotel/api/hotel.api';
import type { HotelStayWithCage } from '../../../../hotel/hotel.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface HotelQueueWidgetProps {
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
 * Superadmin dashboard widget - pets currently checked into the Hotel,
 * reusing the same GET /hotel/stays?status=In Progress endpoint
 * HotelQueuePage's checkout tab draws from (scoped to the viewer's own
 * branch server-side, same as that page).
 */
export function HotelQueueWidget({ accessToken }: HotelQueueWidgetProps) {
  const [stays, setStays] = useState<HotelStayWithCage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listHotelStays(accessToken, 'In Progress').then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the Hotel queue.');
        return;
      }

      setStays(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const sorted = stays
    ? [...stays].sort(
        (a, b) =>
          new Date(b.check_in_at ?? 0).getTime() -
          new Date(a.check_in_at ?? 0).getTime()
      )
    : null;
  const latest = sorted?.[0];
  const latestTime = formatTime(latest?.check_in_at);

  return (
    <QueueWidgetCard
      title="Hotel Queue"
      to="/staff/hotel/queue"
      isLoading={stays === null && !error}
      error={error}
      count={sorted?.length ?? 0}
      countLabel="checked in"
      emptyLabel="No pets currently checked in."
      latestLabel={
        latest
          ? `Cage ${latest.cage_label}${
              latestTime ? ` · checked in ${latestTime}` : ''
            }`
          : null
      }
    />
  );
}
