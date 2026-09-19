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
import { DataCalendar } from '../../../../shared/components/DataCalendar/DataCalendar';
import { DataList } from '../../../../shared/components/DataList/DataList';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { ViewSwitcher, type ViewSwitcherOption } from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import type { ActivityLogAction, ActivityLogEntry } from '../../hotel.types';
import {
  ACTIVITY_LOG_COMPARATORS,
  ACTIVITY_LOG_FILTER_FIELDS,
  ACTIVITY_LOG_SORT_FIELDS,
  activityLogDateKey,
  applyActivityLogFilters,
  deriveActivityLogServerParams,
  deriveActivityLogSortKey,
  matchesActivityLogQuery,
} from './activityLogBrowserFields';
import styles from './ActivityLogPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Pet Assistant',
  'Groomer',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

type ViewMode = 'list' | 'calendar';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'list', label: 'List' },
  { value: 'calendar', label: 'Calendar' },
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

  const [view, setView] = useState<ViewMode>('list');
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([
    // Matches the page's old always-on "Today" default.
    { fieldId: 'date', value: { preset: 'today', from: null, to: null } },
  ]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverParams = useMemo(
    () => deriveActivityLogServerParams(filterTiles),
    [filterTiles]
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

    void listActivityLog(accessToken, serverParams).then((result) => {
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
  }, [accessToken, roleStatus, serverParams]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? entries.filter((entry) => matchesActivityLogQuery(entry, query))
      : entries;
    const withFilters = applyActivityLogFilters(searched, filterTiles);

    // No sort tile means "keep fetch order" (already newest-first, server-side).
    if (!sortTile) return withFilters;
    return [...withFilters].sort(
      ACTIVITY_LOG_COMPARATORS[deriveActivityLogSortKey(sortTile)]
    );
  }, [entries, search, filterTiles, sortTile]);

  function handleAddFilter(fieldId: string) {
    const field = ACTIVITY_LOG_FILTER_FIELDS.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

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

        <FilterSortBar
          filterFields={ACTIVITY_LOG_FILTER_FIELDS}
          filterTiles={filterTiles}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
          sortFields={ACTIVITY_LOG_SORT_FIELDS}
          sortTile={sortTile}
          onChangeSort={setSortTile}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search activity..."
        >
          <ViewSwitcher
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            ariaLabel="Activity log view"
          />
        </FilterSortBar>

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

        {!isLoading && view === 'list' ? (
          <DataList
            items={filtered}
            getRowKey={(entry) => entry.id}
            emptyMessage="No activity matches these filters. Try widening the date range or action above."
            renderItem={(entry) => {
              const Icon = ACTION_ICON[entry.action];

              return (
                <div className={styles.row}>
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
                </div>
              );
            }}
          />
        ) : null}

        {!isLoading && view === 'calendar' ? (
          <DataCalendar
            mode="month"
            anchorDate={calendarAnchor}
            onAnchorDateChange={setCalendarAnchor}
            items={filtered}
            getItemDate={activityLogDateKey}
            getRowKey={(entry) => entry.id}
            renderChip={(entry) => {
              const Icon = ACTION_ICON[entry.action];
              return (
                <span
                  className={`${styles.calendarChip} ${actionClass(entry.action, styles)}`}
                >
                  <Icon size={11} aria-hidden="true" />
                  {entry.description}
                </span>
              );
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
