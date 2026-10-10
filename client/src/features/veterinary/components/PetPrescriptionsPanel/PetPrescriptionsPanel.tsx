import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { PrescriptionPrintout } from '../../../../shared/components/PrescriptionPrintout/PrescriptionPrintout';
import { listPetPrescriptions } from '../../../customers/api/customer.api';
import type { PetPrescriptionHistoryEntry } from '../../../customers/customer.types';
import styles from './PetPrescriptionsPanel.module.css';

export interface PetPrescriptionsPanelProps {
  petId: string;
  petName: string;
  accessToken: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' });
}

/**
 * My Patients > "View prescription": every prescription written for one
 * patient, newest first, each with its medicine details and a "Print
 * prescription" button. Offered for every patient - one with nothing
 * prescribed yet simply says so. Rendered inside the page's detail panel,
 * beside PetHistoryTab; the panel supplies the pet/owner heading.
 *
 * Printing reuses PrescriptionPrintout, the letterheaded sheet a customer
 * takes to a pharmacy. Give it a `key` per pet so it loads fresh each time.
 */
export function PetPrescriptionsPanel({
  petId,
  petName,
  accessToken,
}: PetPrescriptionsPanelProps) {
  const [entries, setEntries] = useState<PetPrescriptionHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<PetPrescriptionHistoryEntry | null>(
    null
  );

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

  function printEntry(entry: PetPrescriptionHistoryEntry) {
    // The sheet has to be in the page before the print dialog opens, so its
    // render is flushed rather than left for the next paint.
    flushSync(() => setPrinting(entry));
    window.print();
  }

  if (isLoading) {
    return <LoadingState label="Loading prescriptions..." />;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className={styles.empty}>
        No prescription has been written for {petName} yet.
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.consultation_id} className={styles.item}>
            <div className={styles.itemHeader}>
              <div>
                <p className={styles.date}>{formatDate(entry.date)}</p>
                <p className={styles.copy}>
                  {entry.veterinarian_name
                    ? `Prescribed by ${entry.veterinarian_name}`
                    : 'Prescribing veterinarian not recorded'}
                  {entry.branch_name ? ` · ${entry.branch_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                className={styles.printButton}
                onClick={() => printEntry(entry)}
              >
                Print prescription
              </button>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Medication</th>
                    <th scope="col">Strength</th>
                    <th scope="col">Dosage</th>
                    <th scope="col">Route</th>
                    <th scope="col">Frequency</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Instructions</th>
                    <th scope="col">Refills</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.medications.map((medication, index) => (
                    <tr key={index}>
                      <th scope="row">{medication.name}</th>
                      <td>{medication.strength || '—'}</td>
                      <td>{medication.dose || '—'}</td>
                      <td>{medication.medicine_type || '—'}</td>
                      <td>{medication.frequency || '—'}</td>
                      <td>{medication.duration || '—'}</td>
                      <td>
                        {medication.quantity != null
                          ? `${medication.quantity}${medication.quantity_unit ? ` ${medication.quantity_unit}` : ''}`
                          : '—'}
                      </td>
                      <td>{medication.notes || '—'}</td>
                      <td>{medication.refills ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
      {printing ? (
        <PrescriptionPrintout
          branchName={printing.branch_name}
          branchAddress={printing.branch_address}
          veterinarianName={printing.veterinarian_name}
          petName={printing.pet_name}
          ownerName={printing.owner_name}
          date={printing.date}
          medications={printing.medications}
          onDone={() => setPrinting(null)}
        />
      ) : null}
    </>
  );
}
