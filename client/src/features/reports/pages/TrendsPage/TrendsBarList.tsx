import styles from './TrendsPage.module.css';

export interface TrendsBarRow {
  key: string;
  label: string;
  value: number;
  /** Extra context after the value, e.g. "2 completed" or "+3 new". */
  note?: string;
  /** Drawn in the muted colour - e.g. the 'Unassigned' row. */
  muted?: boolean;
}

interface TrendsBarListProps {
  rows: TrendsBarRow[];
  /** Names the list for screen readers - usually the panel title. */
  label: string;
  emptyMessage: string;
}

/**
 * A ranked list of horizontal bars: name, bar, count. Every Trends panel
 * is one series of counts with long names (services, packages, people),
 * which reads better as labelled rows than as a chart axis, wraps cleanly
 * at phone width, and stays a plain list for screen readers. Bars are
 * scaled to the panel's largest value.
 */
export function TrendsBarList({
  rows,
  label,
  emptyMessage,
}: TrendsBarListProps) {
  if (rows.length === 0 || rows.every((row) => row.value === 0)) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  const max = Math.max(...rows.map((row) => row.value));

  return (
    <ol className={styles.barList} aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className={styles.barRow}>
          <span className={styles.barLabel}>{row.label}</span>
          <span className={styles.barTrack} aria-hidden="true">
            <span
              className={row.muted ? styles.barFillMuted : styles.barFill}
              style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
            />
          </span>
          <span className={styles.barValue}>
            {row.value}
            {row.note ? (
              <span className={styles.barNote}> · {row.note}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
