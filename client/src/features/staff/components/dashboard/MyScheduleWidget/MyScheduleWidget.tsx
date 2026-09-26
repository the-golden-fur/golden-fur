import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { listUnavailabilityBlocks } from '../../../api/staff.api';
import type { UnavailabilityBlock } from '../../../staff.types';
import styles from './MyScheduleWidget.module.css';

interface MyScheduleWidgetProps {
  staffId: string;
  accessToken: string;
}

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const LEAVE_TYPE_CLASS: Record<UnavailabilityBlock['leave_type'], string> = {
  'Rest Day': styles.restDay,
  'Vacation Leave': styles.vacationLeave,
  'Sick Leave': styles.sickLeave,
  Other: styles.other,
};

const LEGEND: UnavailabilityBlock['leave_type'][] = [
  'Rest Day',
  'Vacation Leave',
  'Sick Leave',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/**
 * Supervisor dashboard widget - a compact, read-only view of the current
 * month from MySchedulePage: each day the viewer has a rest day or leave on
 * is tinted by leave type, today is outlined, and the whole calendar links
 * through to the full My Schedule page (month navigation, entry details).
 */
export function MyScheduleWidget({
  staffId,
  accessToken,
}: MyScheduleWidgetProps) {
  const [entries, setEntries] = useState<UnavailabilityBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayKey = dateKey(year, month, now.getDate());

  useEffect(() => {
    if (!accessToken || !staffId) return;

    let isMounted = true;

    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 1).toISOString();

    void listUnavailabilityBlocks(staffId, accessToken, { from, to }).then(
      (result) => {
        if (!isMounted) return;

        if (result.error || !result.data) {
          setError(result.error ?? 'Could not load your schedule.');
          return;
        }

        setEntries(result.data);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, staffId, year, month]);

  const entryByDate = useMemo(() => {
    const map = new Map<string, UnavailabilityBlock>();
    for (const entry of entries ?? []) {
      const start = new Date(entry.start_time);
      const key = dateKey(
        start.getFullYear(),
        start.getMonth(),
        start.getDate()
      );
      if (!map.has(key)) map.set(key, entry);
    }
    return map;
  }, [entries]);

  const totalDays = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  const monthLabel = now.toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>My Schedule</h2>
          <p className={styles.copy}>{monthLabel}</p>
        </div>
        <Link to="/staff/my-schedule" className={styles.viewLink}>
          View schedule
        </Link>
      </div>

      {entries === null && !error ? (
        <p className={styles.copy}>Loading schedule...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className={styles.calendar}>
            {WEEKDAY_HEADERS.map((label, index) => (
              <div key={index} className={styles.weekdayHeader} aria-hidden>
                {label}
              </div>
            ))}
            {cells.map((day, index) => {
              if (day === null) {
                return <div key={`blank-${index}`} />;
              }

              const key = dateKey(year, month, day);
              const entry = entryByDate.get(key);
              const classNames = [
                styles.day,
                entry ? LEAVE_TYPE_CLASS[entry.leave_type] : '',
                key === todayKey ? styles.today : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={key}
                  className={classNames}
                  title={entry ? entry.leave_type : undefined}
                  aria-label={
                    entry ? `${day}: ${entry.leave_type}` : String(day)
                  }
                >
                  {day}
                </div>
              );
            })}
          </div>

          <ul className={styles.legend}>
            {LEGEND.map((type) => (
              <li key={type} className={styles.legendItem}>
                <span
                  className={`${styles.swatch} ${LEAVE_TYPE_CLASS[type]}`}
                  aria-hidden
                />
                {type}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
