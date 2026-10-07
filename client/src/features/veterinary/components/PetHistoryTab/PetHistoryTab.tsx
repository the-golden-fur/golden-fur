import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import type {
  Consultation,
  ConsultationMedication,
} from '../../veterinary.types';
import styles from './PetHistoryTab.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

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

/** A medicine's prescription on one line - route, strength, quantity, dose, frequency,
 * duration - leaving out whatever wasn't filled in. */
function describeMedication(medication: ConsultationMedication): string {
  return [
    medication.medicine_type,
    medication.strength,
    medication.quantity != null
      ? `Qty ${medication.quantity}${medication.quantity_unit ? ` ${medication.quantity_unit}` : ''}`
      : null,
    medication.dose,
    medication.frequency,
    medication.duration,
    medication.notes,
    medication.refills ? `Refills ${medication.refills}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
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
    return <LoadingState label="Loading pet history..." />;
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
            {consultation.booking ? (
              <BookingStatusBadge status={consultation.booking.status} />
            ) : null}
          </div>
          <p className={styles.reason}>{consultation.reason_for_visit}</p>
          {consultation.diagnosis ? (
            <p className={styles.detail}>Diagnosis: {consultation.diagnosis}</p>
          ) : null}
          {consultation.medications && consultation.medications.length > 0 ? (
            <ul className={styles.medicationList}>
              {consultation.medications.map((medication, index) => (
                <li key={index} className={styles.medication}>
                  <span className={styles.medicationName}>
                    {medication.name}
                  </span>
                  <span className={styles.detail}>
                    {describeMedication(medication)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
