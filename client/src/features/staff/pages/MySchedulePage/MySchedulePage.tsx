import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile, listUnavailabilityBlocks } from '../../api/staff.api';
import type { StaffProfile, UnavailabilityBlock } from '../../staff.types';
import styles from './MySchedulePage.module.css';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const LEAVE_TYPE_CLASS: Record<UnavailabilityBlock['leave_type'], string> = {
  'Rest Day': 'restDay',
  'Vacation Leave': 'vacationLeave',
  'Sick Leave': 'sickLeave',
  Other: 'other',
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function dateKeyFromDate(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
}

/**
 * "See my schedule" (rest days / vacation / sick leave a Supervisor or Admin
 * plotted on the branch-wide Monthly Schedule) - read-only, scoped to the
 * signed-in staff member's own entries. Reuses the calendar grid look of
 * MonthlySchedulePage but drops everything manager-only there (staff
 * picker, add/remove, branch switcher) since a staff member here can only
 * ever be looking at themselves. Every role can reach this - it's a "see my
 * own data" page, not a permission tier.
 */
export function MySchedulePage() {
  const { user, accessToken } = useAuth();

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [entries, setEntries] = useState<UnavailabilityBlock[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedEntry, setSelectedEntry] =
    useState<UnavailabilityBlock | null>(null);

  useEffect(() => {
    if (!user?.id || !accessToken) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoadingProfile(false);

      if (result.error || !result.data) {
        setProfileError(result.error ?? 'Could not load your profile.');
        return;
      }

      setProfile(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  useEffect(() => {
    if (!accessToken || !profile) return;

    let isMounted = true;

    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 1).toISOString();

    void listUnavailabilityBlocks(profile.id, accessToken, { from, to }).then(
      (result) => {
        if (!isMounted) return;

        setIsLoadingEntries(false);

        if (result.error || !result.data) {
          setLoadError(result.error ?? 'Could not load your schedule.');
          return;
        }

        setLoadError(null);
        setEntries(result.data);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, profile, year, month]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, UnavailabilityBlock[]>();
    for (const entry of entries) {
      const key = dateKeyFromDate(new Date(entry.start_time));
      const bucket = map.get(key) ?? [];
      bucket.push(entry);
      map.set(key, bucket);
    }
    return map;
  }, [entries]);

  const totalDays = daysInMonth(year, month);
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  function goToPrevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your schedule.
        </p>
      </main>
    );
  }

  if (isLoadingProfile) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {profileError ?? 'Unable to load your schedule.'}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>My Schedule</h1>
        <p className={styles.copy}>
          Rest days and approved leave your Supervisor/Admin has plotted for
          you. Want time off?{' '}
          <Link className={styles.link} to="/staff/days-off">
            Request a day off
          </Link>
          .
        </p>

        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.navButton}
            onClick={goToPrevMonth}
            aria-label="Previous month"
          >
            &larr;
          </button>
          <span className={styles.monthLabel}>
            {MONTH_LABELS[month]} {year}
          </span>
          <button
            type="button"
            className={styles.navButton}
            onClick={goToNextMonth}
            aria-label="Next month"
          >
            &rarr;
          </button>
        </div>

        {loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : null}

        {isLoadingEntries ? (
          <p className={styles.copy}>Loading schedule...</p>
        ) : (
          <div className={styles.calendar}>
            {WEEKDAY_HEADERS.map((label) => (
              <div key={label} className={styles.weekdayHeader}>
                {label}
              </div>
            ))}
            {cells.map((day, index) => {
              if (day === null) {
                return (
                  <div key={`blank-${index}`} className={styles.dayCellBlank} />
                );
              }

              const key = dateKey(year, month, day);
              const dayEntries = entriesByDate.get(key) ?? [];

              return (
                <div key={key} className={styles.dayCell}>
                  <div className={styles.dayCellHeader}>
                    <span>{day}</span>
                  </div>
                  <div className={styles.dayChips}>
                    {dayEntries.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        className={`${styles.chip} ${
                          styles[LEAVE_TYPE_CLASS[entry.leave_type]]
                        }`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        {entry.leave_type}
                        {entry.status !== 'approved'
                          ? ` (${entry.status})`
                          : ''}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedEntry ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setSelectedEntry(null)}
          >
            <section
              className={`${styles.panel} ${styles.modalBox}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="my-schedule-entry-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className={styles.sectionTitle} id="my-schedule-entry-title">
                {selectedEntry.leave_type}
              </h2>
              <p className={styles.copy}>Status: {selectedEntry.status}</p>
              <p className={styles.copy}>
                {formatDate(selectedEntry.start_time)} &ndash;{' '}
                {formatDate(selectedEntry.end_time)}
              </p>
              {selectedEntry.reason ? (
                <p className={styles.copy}>Reason: {selectedEntry.reason}</p>
              ) : null}

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setSelectedEntry(null)}
              >
                Close
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
