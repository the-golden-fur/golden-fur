import { useEffect, useState } from 'react';
import { listPetPrescriptions } from '../../../api/customer.api';
import type { PetPrescriptionHistoryEntry } from '../../../customer.types';
import styles from './PrescriptionList.module.css';

interface PrescriptionListProps {
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
 * #117: "As a customer, I want a copy of this created prescription that is
 * tied directly to my pet, I want to be able to view a history of them
 * too." Read-only, same shape as MedicalNoteList/VaccinationRecordList - a
 * customer viewing only their own pet's history doesn't need the fuller
 * search/sort/filter/view toolbar that the staff-facing Prescriptions page
 * uses (that one browses every patient, this one is always just one pet's
 * small, permanently-read-only list).
 */
export function PrescriptionList({
  petId,
  accessToken,
}: PrescriptionListProps) {
  const [entries, setEntries] = useState<PetPrescriptionHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listPetPrescriptions(petId, accessToken).then((result) => {
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
    return <p className={styles.copy}>Loading prescriptions...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className={styles.copy}>No prescriptions yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li className={styles.item} key={entry.consultation_id}>
          <span className={styles.date}>{formatDate(entry.date)}</span>
          <ul className={styles.medicationList}>
            {entry.medications.map((medication, index) => (
              <li key={index} className={styles.medication}>
                <span className={styles.medicationName}>
                  {medication.name} — {medication.dose}
                </span>
                {medication.medicine_type ? (
                  <span className={styles.badge}>
                    {medication.medicine_type}
                  </span>
                ) : null}
                {medication.frequency ? (
                  <span className={styles.badge}>{medication.frequency}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
