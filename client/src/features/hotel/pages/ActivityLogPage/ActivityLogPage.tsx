import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LogIn,
  LogOut,
  PlayCircle,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { listActivityLog } from '../../api/hotel.api';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  dateRangePresetLabel,
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import type { ActivityLogAction, ActivityLogEntry } from '../../hotel.types';
import styles from './ActivityLogPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Pet Assistant',
  'Groomer',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

type ActionFilter = 'All' | ActivityLogAction;

const ACTION_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All actions' },
  { value: 'check_in', label: 'Check-in' },
  { value: 'check_out', label: 'Check-out' },
  { value: 'task_started', label: 'Task started' },
  { value: 'task_completed', label: 'Task completed' },
  { value: 'task_reopened', label: 'Task reopened' },
  { value: 'task_missed', label: 'Task missed' },
];

const ACTION_ICON: Record<ActivityLogAction, LucideIcon> = {
  check_in: LogIn,
  check_out: LogOut,
  task_started: PlayCircle,
  task_completed: CheckCircle2,
  task_reopened: RotateCcw,
  task_missed: AlertTriangle,
};

const ACTION_LABEL: Record<ActivityLogAction, string> = {
  check_in: 'Check-in',
  check_out: 'Check-out',
  task_started: 'Task started',
  task_completed: 'Task completed',
  task_reopened: 'Task reopened',
  task_missed: 'Task missed',
};

function actionClass(
  action: ActivityLogAction,
  styleMap: typeof styles
): string {
  switch (action) {
    case 'check_in':
      return styleMap.actionCheckIn;
    case 'check_out':
      return styleMap.actionCheckOut;
    case 'task_started':
      return styleMap.actionStarted;
    case 'task_completed':
      return styleMap.actionCompleted;
    case 'task_reopened':
      return styleMap.actionReopened;
    case 'task_missed':
      return styleMap.actionMissed;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Custom change: Hotel/Daycare activity logbook (#48 follow-up) - "a
 * logbook for all hotel/daycare actions (e.g. task moved from pending > in
 * progress, etc.)". Newest first, filterable by date range and action type;
 * every row already carries a human-readable description generated
 * server-side at write time (see activityLog.service.ts), so this page is
 * read-only - there's nothing to edit, only to review.
 */
export function ActivityLogPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [actionFilter, setActionFilter] = useState<ActionFilter>('All');

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!accessToken || roleStatus !== 'ok') return;

    let isMounted = true;

    void listActivityLog(accessToken, {
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    }).then((result) => {
      if (!isMounted) return;
      setIsLoading(false);

      if (!result.data) {
        setError(result.error);
        return;
      }

      setError(null);
      setEntries(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, roleStatus, dateRange.from, dateRange.to]);

  const filtered = useMemo(
    () =>
      actionFilter === 'All'
        ? entries
        : entries.filter((entry) => entry.action === actionFilter),
    [entries, actionFilter]
  );

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];

    if (dateRangePreset !== 'today') {
      chips.push({
        id: 'date',
        label: `Date: ${dateRangePresetLabel(dateRangePreset)}`,
        onClear: () => setDateRangePreset('today'),
      });
    }
    if (actionFilter !== 'All') {
      chips.push({
        id: 'action',
        label: `Action: ${ACTION_OPTIONS.find((option) => option.value === actionFilter)?.label ?? actionFilter}`,
        onClear: () => setActionFilter('All'),
      });
    }

    return chips;
  }, [dateRangePreset, actionFilter]);

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the Activity Log.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Activity Log</h1>

        <QueueFilterBar
          dateRangePreset={dateRangePreset}
          onDateRangePresetChange={setDateRangePreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          statusValue={actionFilter}
          onStatusChange={(value) => setActionFilter(value as ActionFilter)}
          statusOptions={ACTION_OPTIONS}
          statusLabel="Action"
        />

        <ActiveFilterChips chips={filterChips} />

        <p className={styles.resultCount}>
          {isLoading
            ? 'Loading activity...'
            : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
        </p>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        {!isLoading && !error && filtered.length === 0 ? (
          <p className={styles.copy}>
            No activity matches these filters. Try widening the date range or
            action above.
          </p>
        ) : null}

        {!isLoading && filtered.length > 0 ? (
          <ul className={styles.list}>
            {filtered.map((entry) => {
              const Icon = ACTION_ICON[entry.action];

              return (
                <li key={entry.id} className={styles.row}>
                  <span
                    className={`${styles.actionBadge} ${actionClass(entry.action, styles)}`}
                  >
                    <Icon size={13} aria-hidden="true" />
                    {ACTION_LABEL[entry.action]}
                  </span>
                  <span className={styles.description}>
                    {entry.description}
                  </span>
                  <span className={styles.meta}>
                    {entry.actor_staff?.display_name ?? 'System'} ·{' '}
                    {formatDateTime(entry.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
