import { useEffect, useState } from 'react';
import {
  listConsultationFormTemplates,
  listMedicationCatalog,
} from '../../../../veterinary/api/veterinary.api';
import { QueueWidgetCard } from '../QueueWidgetCard/QueueWidgetCard';

interface VeterinaryCatalogWidgetProps {
  accessToken: string;
}

/**
 * Veterinarian dashboard widget - the caller's own saved medications and
 * consultation form templates at a glance, reusing the same two endpoints
 * VetCatalogPage itself calls (owner-scoped server-side, same as that page).
 * #117: procedures replaced by consultation form templates.
 */
export function VeterinaryCatalogWidget({
  accessToken,
}: VeterinaryCatalogWidgetProps) {
  const [counts, setCounts] = useState<{
    medications: number;
    consultationForms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void Promise.all([
      listMedicationCatalog(accessToken),
      listConsultationFormTemplates(accessToken),
    ]).then(([medResult, templateResult]) => {
      if (!isMounted) return;

      if (medResult.error || !medResult.data) {
        setError(medResult.error ?? 'Could not load your catalog.');
        return;
      }
      if (templateResult.error || !templateResult.data) {
        setError(templateResult.error ?? 'Could not load your catalog.');
        return;
      }

      setCounts({
        medications: medResult.data.length,
        consultationForms: templateResult.data.length,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const total = counts ? counts.medications + counts.consultationForms : 0;

  return (
    <QueueWidgetCard
      title="My Catalog"
      to="/staff/veterinary/catalog"
      isLoading={counts === null && !error}
      error={error}
      count={total}
      countLabel="saved items"
      emptyLabel="No saved medications or consultation form templates yet."
      latestLabel={
        counts
          ? `${counts.medications} medications · ${counts.consultationForms} consultation form templates`
          : null
      }
    />
  );
}
