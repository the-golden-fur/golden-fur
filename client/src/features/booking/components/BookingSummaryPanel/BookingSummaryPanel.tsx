import { Check } from 'lucide-react';
import styles from './BookingSummaryPanel.module.css';

export type BookingSummaryRowStatus = 'done' | 'current' | 'upcoming';

export interface BookingSummaryLine {
  text: string;
  /** Optional PHP amount, right-aligned (e.g. a service's price). */
  amount?: number;
}

export interface BookingSummaryRow {
  key: string;
  label: string;
  status: BookingSummaryRowStatus;
  /** What was chosen on this step - empty while nothing has been picked
   * yet, in which case the row shows its label only. */
  lines: BookingSummaryLine[];
  /** Jump back to this step. Omitted for the current step and for steps
   * not reached yet - same reachability rule as BookingStepper. */
  onSelect?: () => void;
}

export interface BookingSummaryCommittedEntry {
  id: string;
  title: string;
  lines: string[];
  subtotal: number;
}

interface BookingSummaryPanelProps {
  /** One row per stepper step, in stepper order. */
  rows: BookingSummaryRow[];
  /** Multi-booking checkout: bookings already committed to this checkout
   * ("Add another booking"), shown above the rows for the one in progress. */
  committedEntries: BookingSummaryCommittedEntry[];
  /** Services/packages subtotal across the whole checkout - discounts and
   * promos are only resolved on the Review step, so they're not reflected
   * here. */
  subtotal: number;
}

function formatPhp(amount: number): string {
  return `PHP ${amount.toFixed(2)}`;
}

/**
 * Receipt-style "Your booking" recap shown beside the booking wizard: each
 * step's row fills in with what was chosen as the customer/receptionist
 * works through the flow. Purely presentational - CustomerBookingFlowPage
 * builds the rows from its own step state (same reason BookingStepper only
 * sees plain labels, never step definitions).
 */
export function BookingSummaryPanel({
  rows,
  committedEntries,
  subtotal,
}: BookingSummaryPanelProps) {
  return (
    <aside className={styles.panel} aria-labelledby="booking-summary-title">
      <h2 id="booking-summary-title" className={styles.title}>
        Your booking
      </h2>

      {committedEntries.length > 0 ? (
        <section className={styles.committed} aria-label="In this checkout">
          <p className={styles.sectionLabel}>In this checkout</p>
          <ul className={styles.committedList}>
            {committedEntries.map((entry) => (
              <li key={entry.id} className={styles.committedEntry}>
                <div className={styles.lineRow}>
                  <span className={styles.committedTitle}>{entry.title}</span>
                  <span className={styles.amount}>
                    {formatPhp(entry.subtotal)}
                  </span>
                </div>
                {entry.lines.map((line) => (
                  <span key={line} className={styles.lineText}>
                    {line}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className={styles.rows}>
        {rows.map((row) => {
          const header = (
            <>
              <span
                className={`${styles.marker} ${styles[row.status]}`}
                aria-hidden="true"
              >
                {row.status === 'done' ? <Check size={12} /> : null}
              </span>
              <span className={styles.rowLabel}>{row.label}</span>
              <span className="sr-only">
                {row.status === 'done'
                  ? '(completed)'
                  : row.status === 'current'
                    ? '(current step)'
                    : '(not started)'}
              </span>
            </>
          );

          return (
            <li
              key={row.key}
              className={`${styles.row} ${styles[row.status]}`}
              aria-current={row.status === 'current' ? 'step' : undefined}
            >
              {row.onSelect ? (
                <button
                  type="button"
                  className={styles.rowHeaderButton}
                  onClick={row.onSelect}
                >
                  {header}
                </button>
              ) : (
                <div className={styles.rowHeader}>{header}</div>
              )}

              {row.lines.length > 0 ? (
                <ul className={styles.lines}>
                  {row.lines.map((line, index) => (
                    <li
                      key={`${line.text}-${index}`}
                      className={styles.lineRow}
                    >
                      <span className={styles.lineText}>{line.text}</span>
                      {line.amount !== undefined ? (
                        <span className={styles.amount}>
                          {formatPhp(line.amount)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className={styles.footer}>
        <span>Subtotal</span>
        <span className={styles.total}>{formatPhp(subtotal)}</span>
      </div>
      <p className={styles.footnote}>
        Discounts and promos are applied on the Review step.
      </p>
    </aside>
  );
}
