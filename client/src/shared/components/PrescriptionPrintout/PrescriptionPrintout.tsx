import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './PrescriptionPrintout.module.css';

export interface PrescriptionPrintoutMedication {
  name: string;
  dose: string;
  medicine_type?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: number | null;
}

export interface PrescriptionPrintoutProps {
  branchName: string | null;
  branchAddress: string | null;
  veterinarianName: string | null;
  petName: string | null;
  ownerName: string | null;
  /** When the visit happened (ISO). */
  date: string;
  medications: PrescriptionPrintoutMedication[];
  /** Called once the browser's print dialog has closed, so the owner can
   * unmount this sheet again. */
  onDone: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' });
}

/**
 * Pharmacy prescriptions: the paper copy a customer takes to another
 * pharmacy. Deliberately carries no prices - what the medicine costs is the
 * other pharmacy's business.
 *
 * Mounted only while a print is in progress, and rendered straight under
 * <body> (a portal) rather than where its button sits: hidden on screen,
 * and in print it is the only thing shown - the print rule in the
 * stylesheet hides every other child of <body>, which is what keeps the app
 * shell and any open modal off the page. The owner mounts it and calls
 * window.print(); this component just reports back on `afterprint`.
 */
export function PrescriptionPrintout({
  branchName,
  branchAddress,
  veterinarianName,
  petName,
  ownerName,
  date,
  medications,
  onDone,
}: PrescriptionPrintoutProps) {
  // Read through a ref so a new onDone identity on re-render never
  // re-subscribes mid-print.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const handleAfterPrint = () => onDoneRef.current();

    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return createPortal(
    <div className={styles.sheet} role="document" aria-label="Prescription">
      <header className={styles.letterhead}>
        <p className={styles.branchName}>{branchName ?? 'Golden Fur'}</p>
        {branchAddress ? (
          <p className={styles.branchAddress}>{branchAddress}</p>
        ) : null}
      </header>

      <h1 className={styles.title}>Prescription</h1>

      <dl className={styles.details}>
        <div>
          <dt>Patient</dt>
          <dd>{petName ?? '—'}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{ownerName ?? '—'}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatDate(date)}</dd>
        </div>
        <div>
          <dt>Veterinarian</dt>
          <dd>{veterinarianName ?? '—'}</dd>
        </div>
      </dl>

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Medicine</th>
            <th scope="col">Type</th>
            <th scope="col">Quantity</th>
            <th scope="col">Dose</th>
            <th scope="col">Frequency</th>
            <th scope="col">Duration</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((medication, index) => (
            <tr key={index}>
              <th scope="row">{medication.name}</th>
              <td>{medication.medicine_type || '—'}</td>
              <td>{medication.quantity ?? '—'}</td>
              <td>{medication.dose || '—'}</td>
              <td>{medication.frequency || '—'}</td>
              <td>{medication.duration || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className={styles.signature}>
        <span className={styles.signatureLine} />
        <span>{veterinarianName ?? 'Veterinarian'}</span>
      </footer>
    </div>,
    document.body
  );
}
