import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getCareLogEntries } from '../../../../hotel/api/hotel.api';
import type { CareLogEntry, MealTime } from '../../../../hotel/hotel.types';
import styles from './BoardingChecklistWidget.module.css';

interface BoardingChecklistWidgetProps {
  accessToken: string;
}

const TIME_BLOCKS: MealTime[] = ['Morning', 'Noon', 'Afternoon', 'Evening'];

const STATUS_ROWS: {
  status: CareLogEntry['status'];
  className: string;
}[] = [
  { status: 'Pending', className: styles.statusPending },
  { status: 'In Progress', className: styles.statusInProgress },
  { status: 'Completed', className: styles.statusCompleted },
  { status: 'Missed', className: styles.statusMissed },
];

function isOpen(entry: CareLogEntry): boolean {
  return entry.status === 'Pending' || entry.status === 'In Progress';
}

/**
 * Groomer dashboard widget - today's Boarding Checklist (feeding, walking,
 * playtime, medication for checked-in Hotel/Daycare pets) at a glance,
 * reusing the same GET /hotel/care-log/today endpoint BoardingChecklistPage
 * calls with no date range (server defaults to today, viewer's branch).
 * Shows overall progress, a per-status count, and how many tasks are still
 * open in each time block, with a click-through to the full Kanban board.
 */
export function BoardingChecklistWidget({
  accessToken,
}: BoardingChecklistWidgetProps) {
  const [entries, setEntries] = useState<CareLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void getCareLogEntries(accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the boarding checklist.');
        return;
      }

      setEntries(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const total = entries?.length ?? 0;
  const completed =
    entries?.filter((entry) => entry.status === 'Completed').length ?? 0;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Boarding Checklist</h2>
        <Link to="/staff/hotel/care-log" className={styles.viewLink}>
          Open checklist
        </Link>
      </div>

      {entries === null && !error ? (
        <p className={styles.copy}>Loading today&apos;s checklist...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : total === 0 ? (
        <p className={styles.copy}>No care tasks scheduled for today.</p>
      ) : (
        <>
          <div className={styles.progress}>
            <p className={styles.progressLabel}>
              <span className={styles.progressCount}>
                {completed} of {total}
              </span>{' '}
              tasks done today
            </p>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="Today's boarding checklist progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className={styles.badges}>
            {STATUS_ROWS.map(({ status, className }) => (
              <span key={status} className={`${styles.badge} ${className}`}>
                {status}:{' '}
                {entries!.filter((entry) => entry.status === status).length}
              </span>
            ))}
          </div>

          <div>
            <h3 className={styles.subTitle}>Still to do</h3>
            <ul className={styles.blockList}>
              {TIME_BLOCKS.map((block) => {
                const open = entries!.filter(
                  (entry) => entry.time_block === block && isOpen(entry)
                ).length;
                return (
                  <li key={block} className={styles.blockRow}>
                    <span>{block}</span>
                    <span
                      className={
                        open === 0 ? styles.blockDone : styles.blockCount
                      }
                    >
                      {open === 0 ? 'All done' : `${open} open`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
