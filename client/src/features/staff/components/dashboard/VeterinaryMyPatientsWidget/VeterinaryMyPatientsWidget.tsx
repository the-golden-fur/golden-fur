import { useEffect, useState } from 'react';
import { listMyPatients } from '../../../../veterinary/api/veterinary.api';
import type { VeterinarianPatient } from '../../../../veterinary/veterinary.types';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface VeterinaryMyPatientsWidgetProps {
  accessToken: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Veterinarian dashboard widget - the caller's own patient roster at a
 * glance, reusing the same GET /veterinary/my-patients endpoint
 * MyPatientsPage itself calls (requester-scoped server-side, same as that
 * page).
 */
export function VeterinaryMyPatientsWidget({
  accessToken,
}: VeterinaryMyPatientsWidgetProps) {
  const [patients, setPatients] = useState<VeterinarianPatient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listMyPatients(accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load your patients.');
        return;
      }

      setPatients(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const mostRecent = patients
    ? [...patients].sort(
        (a, b) =>
          new Date(b.last_visit_at).getTime() -
          new Date(a.last_visit_at).getTime()
      )[0]
    : undefined;

  return (
    <QueueWidgetCard
      title="My Patients"
      to="/staff/veterinary/my-patients"
      isLoading={patients === null && !error}
      error={error}
      count={patients?.length ?? 0}
      countLabel="patients"
      emptyLabel="No patients yet."
      latestLabel={
        mostRecent ? `Last visit ${formatDate(mostRecent.last_visit_at)}` : null
      }
    />
  );
}
