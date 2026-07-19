import type { Consultation } from '../../veterinary.types';
import { ConsultationStatusBadge } from '../ConsultationStatusBadge/ConsultationStatusBadge';
import styles from './PetHistoryTab.module.css';

interface PetHistoryTabProps {
  consultations: Consultation[];
  isLoading: boolean;
  error: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Issue #70 AC-3: read-only, reachable from within any consultation - lists
 * every prior consultation for the selected pet (diagnosis + medications),
 * newest-first (see consultation.service.ts's listPetConsultationHistory dev
 * note on why - M02's own Service History tab has no established ordering
 * convention to match yet).
 */
export function PetHistoryTab({
  consultations,
  isLoading,
  error,
}: PetHistoryTabProps) {
  if (isLoading) {
    return <p className={styles.copy}>Loading pet history...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (consultations.length === 0) {
    return <p className={styles.copy}>No prior consultations for this pet.</p>;
  }

  return (
    <ul className={styles.list}>
      {consultations.map((consultation) => (
        <li key={consultation.id} className={styles.entry}>
          <div className={styles.entryHeader}>
            <span className={styles.entryDate}>
              {formatDate(consultation.created_at)}
            </span>
            <ConsultationStatusBadge status={consultation.status} />
          </div>
          <p className={styles.reason}>{consultation.reason_for_visit}</p>
          {consultation.diagnosis ? (
            <p className={styles.detail}>Diagnosis: {consultation.diagnosis}</p>
          ) : null}
          {consultation.medications && consultation.medications.length > 0 ? (
            <p className={styles.detail}>
              Medications:{' '}
              {consultation.medications
                .map((medication) => `${medication.name} (${medication.dose})`)
                .join(', ')}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
