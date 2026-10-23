import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PetServiceHistoryEntry } from '../../../customer.types';
import { formatCurrency } from '../../../../../shared/utils/formatCurrency';
import styles from './ServiceHistoryPrintout.module.css';

interface ServiceHistoryPrintoutProps {
  petName: string | null;
  entries: PetServiceHistoryEntry[];
  /** Called once the browser's print dialog has closed, so the owner can
   * unmount this sheet again. */
  onDone: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * The pet's whole service history on paper - every past booking as a table
 * row, with what the completed ones came to. A record for the owner, not a
 * receipt: each payment's own slip is still printed from its row.
 *
 * Same mounting as PrescriptionPrintout: only while a print is in progress,
 * straight under <body> (a portal), hidden on screen - the print rule in the
 * stylesheet hides every other child of <body>. The owner mounts it and
 * calls window.print(); this component just reports back on `afterprint`.
 */
export function ServiceHistoryPrintout({
  petName,
  entries,
  onDone,
}: ServiceHistoryPrintoutProps) {
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

  const completed = entries.filter((entry) => entry.status === 'Completed');
  const totalSpent = completed.reduce(
    (sum, entry) => sum + Number(entry.total_price),
    0
  );

  return createPortal(
    <div
      className={styles.sheet}
      role="document"
      aria-label="Service history report"
    >
      <header className={styles.letterhead}>
        <p className={styles.brand}>Golden Fur</p>
      </header>

      <h1 className={styles.title}>Service History</h1>

      <dl className={styles.details}>
        <div>
          <dt>Pet</dt>
          <dd>{petName ?? '—'}</dd>
        </div>
        <div>
          <dt>Printed</dt>
          <dd>{formatDate(new Date().toISOString())}</dd>
        </div>
        <div>
          <dt>Services</dt>
          <dd>
            {entries.length} ({completed.length} completed)
          </dd>
        </div>
        <div>
          <dt>Total spent</dt>
          <dd>{formatCurrency(totalSpent)}</dd>
        </div>
      </dl>

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Service</th>
            <th scope="col">Details</th>
            <th scope="col">Branch / Staff</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.amount}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isCompleted = entry.status === 'Completed';
            return (
              <tr key={entry.booking_id}>
                <td>{formatDate(entry.date)}</td>
                <th scope="row">{entry.service_category}</th>
                <td>
                  {entry.items.length > 0 ? entry.items.join(', ') : '—'}
                  {!isCompleted && entry.cancellation_reason ? (
                    <span className={styles.reason}>
                      Reason: {entry.cancellation_reason}
                    </span>
                  ) : null}
                </td>
                <td>
                  {[entry.branch_name, entry.staff_name]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
                <td>{entry.status}</td>
                <td className={styles.amount}>
                  {isCompleted
                    ? formatCurrency(entry.total_price)
                    : 'Not charged'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={5}>
              Total spent
            </th>
            <td className={styles.amount}>{formatCurrency(totalSpent)}</td>
          </tr>
        </tfoot>
      </table>
    </div>,
    document.body
  );
}
