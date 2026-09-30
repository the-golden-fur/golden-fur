import { useEffect, useState } from 'react';
import { listPetConsultationResults } from '../../../api/customer.api';
import type { PetConsultationResultEntry } from '../../../customer.types';
import styles from './ConsultationResultList.module.css';
import { LoadingState } from '../../../../../shared/components/LoadingState/LoadingState';

interface ConsultationResultListProps {
  petId: string;
  accessToken: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * #117: "As a patient, I want to be able to view the results and history of
 * my pet's transactions." Read-only, same shape as MedicalNoteList/
 * PrescriptionList - see PrescriptionList's own header note on why this
 * stays the simple list pattern rather than the fuller staff-facing
 * toolbar.
 */
export function ConsultationResultList({
  petId,
  accessToken,
}: ConsultationResultListProps) {
  const [entries, setEntries] = useState<PetConsultationResultEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listPetConsultationResults(petId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setEntries(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  if (isLoading) {
    return <LoadingState label="Loading consultation results..." />;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className={styles.copy}>No consultation results yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li className={styles.item} key={entry.consultation_id}>
          <span className={styles.date}>{formatDate(entry.date)}</span>
          {entry.form_responses.map((response, index) => (
            <div key={index} className={styles.response}>
              <span className={styles.templateName}>
                {response.template_name}
              </span>
              <ul className={styles.fieldList}>
                {response.fields.map((field) => (
                  <li key={field.field_id} className={styles.field}>
                    <span className={styles.fieldLabel}>{field.label}:</span>{' '}
                    {String(field.value)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
