import { useEffect, useState } from 'react';
import { listVaccinationRecords } from '../../../api/customer.api';
import type { PetVaccinationRecord } from '../../../customer.types';
import styles from './VaccinationRecordList.module.css';

interface VaccinationRecordListProps {
  petId: string;
  accessToken: string;
}

/**
 * Read-only in this issue's customer-facing usage (Issue #34 dev notes) - a
 * staff-facing add-record affordance is deferred to Issue #35's admin flow
 * or M07's console, whichever ships it first.
 */
export function VaccinationRecordList({
  petId,
  accessToken,
}: VaccinationRecordListProps) {
  const [records, setRecords] = useState<PetVaccinationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listVaccinationRecords(petId, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setRecords(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  if (isLoading) {
    return <p className={styles.copy}>Loading vaccination records...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (records.length === 0) {
    return <p className={styles.copy}>No vaccination records yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {records.map((record) => (
        <li className={styles.item} key={record.id}>
          <span className={styles.name}>{record.vaccine_name}</span>
          <span className={styles.meta}>
            Administered {record.date_administered}
          </span>
          {record.next_due_date ? (
            <span className={styles.meta}>Next due {record.next_due_date}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
