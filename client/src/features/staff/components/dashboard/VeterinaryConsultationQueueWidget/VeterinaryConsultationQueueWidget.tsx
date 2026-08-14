import { useEffect, useState } from 'react';
import { listConsultationQueue } from '../../../../veterinary/api/veterinary.api';
import type { Consultation } from '../../../../veterinary/veterinary.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface VeterinaryConsultationQueueWidgetProps {
  accessToken: string;
}

function consultationSortTime(consultation: Consultation): number {
  return new Date(
    consultation.booking?.scheduled_start ?? consultation.created_at
  ).getTime();
}

function formatTime(iso: string | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Superadmin dashboard widget - today's Veterinary Consultation queue at a
 * glance, reusing the same GET /veterinary/consultations/queue endpoint
 * VeterinaryConsolePage itself calls (scoped to the viewer's own branch
 * server-side, same as that page).
 */
export function VeterinaryConsultationQueueWidget({
  accessToken,
}: VeterinaryConsultationQueueWidgetProps) {
  const [consultations, setConsultations] = useState<Consultation[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listConsultationQueue(accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the consultation queue.');
        return;
      }

      setConsultations(result.data.consultations);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const sorted = consultations
    ? [...consultations].sort(
        (a, b) => consultationSortTime(a) - consultationSortTime(b)
      )
    : null;
  const next = sorted?.[0];
  const nextTime = formatTime(next?.booking?.scheduled_start);

  return (
    <QueueWidgetCard
      title="Veterinary Consultation Queue"
      to="/staff/veterinary/console"
      isLoading={consultations === null && !error}
      error={error}
      count={sorted?.length ?? 0}
      countLabel="waiting"
      emptyLabel="No consultations today."
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
