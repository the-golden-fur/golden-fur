import { useEffect, useState } from 'react';
import {
  listMedicationCatalog,
  listProcedureCatalog,
} from '../../../../veterinary/api/veterinary.api';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface VeterinaryCatalogWidgetProps {
  accessToken: string;
}

/**
 * Veterinarian dashboard widget - the caller's own saved medication/
 * procedure catalog at a glance, reusing the same two endpoints
 * VetCatalogPage itself calls (owner-scoped server-side, same as that page).
 */
export function VeterinaryCatalogWidget({
  accessToken,
}: VeterinaryCatalogWidgetProps) {
  const [counts, setCounts] = useState<{
    medications: number;
    procedures: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void Promise.all([
      listMedicationCatalog(accessToken),
      listProcedureCatalog(accessToken),
    ]).then(([medResult, procResult]) => {
      if (!isMounted) return;

      if (medResult.error || !medResult.data) {
        setError(medResult.error ?? 'Could not load your catalog.');
        return;
      }
      if (procResult.error || !procResult.data) {
        setError(procResult.error ?? 'Could not load your catalog.');
        return;
      }

      setCounts({
        medications: medResult.data.length,
        procedures: procResult.data.length,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const total = counts ? counts.medications + counts.procedures : 0;

  return (
    <QueueWidgetCard
      title="My Catalog"
      to="/staff/veterinary/catalog"
      isLoading={counts === null && !error}
      error={error}
      count={total}
      countLabel="saved items"
      emptyLabel="No saved medications or procedures yet."
      latestLabel={
        counts
          ? `${counts.medications} medications · ${counts.procedures} procedures`
          : null
      }
    />
  );
}
