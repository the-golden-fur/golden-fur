import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Columns3,
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
} from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataCalendar } from '../../../../shared/components/DataCalendar/DataCalendar';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import {
  cancelUnavailabilityBlock,
  getStaffProfile,
  listUnavailabilityHistory,
} from '../../api/staff.api';
import { UnavailabilityBlockForm } from '../../components/forms/UnavailabilityBlockForm/UnavailabilityBlockForm';
import type {
  StaffProfile,
  UnavailabilityHistoryEntry,
} from '../../staff.types';
import {
  applyDayOffFilters,
  buildDayOffFilterFields,
  buildDayOffGroupByAxes,
  DAY_OFF_COMPARATORS,
  DAY_OFF_SORT_FIELDS,
  dayOffCalendarDateKey,
  dayOffStatusLabel,
  DEFAULT_DAY_OFF_SORT_KEY,
  deriveDayOffSortKey,
  matchesDayOffQuery,
} from './dayOffRequestFields';
import styles from './DayOffRequestsPage.module.css';

type ViewMode = 'table' | 'list' | 'gallery' | 'board' | 'calendar';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { value: 'board', label: 'Board', icon: Columns3 },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
];

type CalendarMode = 'month' | 'week';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Full-day rows read as a date; part-day rows as a start-end window. */
function formatWhen(entry: UnavailabilityHistoryEntry): string {
  if (entry.is_full_day) {
    return formatDate(entry.start_time);
  }

  const sameDay =
    new Date(entry.start_time).toDateString() ===
    new Date(entry.end_time).toDateString();
  const end = sameDay
    ? new Date(entry.end_time).toLocaleTimeString(undefined, {
        timeStyle: 'short',
      })
    : formatDateTime(entry.end_time);

  return `${formatDateTime(entry.start_time)} - ${end}`;
}

/**
 * Day Off Requests (formerly "Days Off"): a self-service queue, reachable
 * from every role's dashboard (staffDashboard.config.ts). "New Request"
 * opens the same UnavailabilityBlockForm StaffManagementPage uses, in a
 * modal; below it is the staff member's whole history - pending, approved,
 * denied, and manager-set Rest Days too (filterable by Type) - with the same
 * search / filter / sort / group-by / view controls as the rest of the app
 * (CustomerBookingsPage is the reference). A still-pending request that
 * hasn't started yet can be edited or cancelled from its "..." menu or by
 * right-clicking (press-and-hold on touch) the row/card.
 */
export function DayOffRequestsPage() {
  const { user, accessToken } = useAuth();
  const nowMs = useNowMs();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [entries, setEntries] = useState<UnavailabilityHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] =
    useState<UnavailabilityHistoryEntry | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState('status');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then(async (profileResult) => {
      if (!isMounted) return;

      if (profileResult.error || !profileResult.data) {
        setIsLoading(false);
        setLoadError(profileResult.error ?? 'Could not load your profile.');
        return;
      }

      setProfile(profileResult.data);

      const historyResult = await listUnavailabilityHistory(
        profileResult.data.id,
        accessToken
      );
      if (!isMounted) return;

      setIsLoading(false);

      if (historyResult.error || !historyResult.data) {
        setLoadError(
          historyResult.error ?? 'Could not load your day off requests.'
        );
        return;
      }

      setLoadError(null);
      setEntries(historyResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken, historyKey]);

  const filterFields = useMemo(
    () => buildDayOffFilterFields(entries),
    [entries]
  );
  const groupByAxes = useMemo(() => buildDayOffGroupByAxes(entries), [entries]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? entries.filter((entry) => matchesDayOffQuery(entry, query))
      : entries;
    const filtered = applyDayOffFilters(searched, filterTiles);
    const sortKey = deriveDayOffSortKey(sortTile);

    return [...filtered].sort(
      DAY_OFF_COMPARATORS[sortKey ?? DEFAULT_DAY_OFF_SORT_KEY]
    );
  }, [entries, search, filterTiles, sortTile]);

  const activeGroupAxis =
    groupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedEntries = useGroupBy(
    visibleEntries,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = filterFields.find((f) => f.id === fieldId);
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

  function handleCreated() {
    setIsFormOpen(false);
    setActionError(null);
    setMessage('Day off request sent.');
    // Refetch rather than splice the create response in: the history row
    // carries server-resolved names (requested reviewer etc.) the bare
    // create response doesn't.
    setHistoryKey((key) => key + 1);
  }

  async function confirmCancel() {
    if (!accessToken || !profile || !cancelTargetId) return;

    setIsCancelling(true);
    setActionError(null);

    const result = await cancelUnavailabilityBlock(
      profile.id,
      accessToken,
      cancelTargetId
    );

    setIsCancelling(false);

    if (result.error) {
      setActionError(result.error);
      return;
    }

    // Kept in the history, just marked cancelled.
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === cancelTargetId ? { ...entry, status: 'cancelled' } : entry
      )
    );
    setCancelTargetId(null);
    setMessage('Day off request cancelled.');
  }

  function handleEdited() {
    setEditTarget(null);
    setActionError(null);
    setMessage('Day off request updated.');
    setHistoryKey((key) => key + 1);
  }

  /** Edit and cancel both need a request that's still waiting on a manager
   * and hasn't started - once decided, it's final. Only the requester's own
   * requests (not a Rest Day a manager set) can be edited. */
  function isOpenRequest(entry: UnavailabilityHistoryEntry): boolean {
    return (
      entry.status === 'pending' && new Date(entry.start_time).getTime() > nowMs
    );
  }

  function entryMenuItems(
    entry: UnavailabilityHistoryEntry
  ): MoreOptionsMenuItem[] {
    return isOpenRequest(entry)
      ? [
          ...(entry.created_by === entry.staff_id
            ? [
                {
                  label: 'Edit request',
                  onSelect: () => {
                    setMessage(null);
                    setEditTarget(entry);
                  },
                },
              ]
            : []),
          {
            label: 'Cancel request',
            onSelect: () => {
              setActionError(null);
              setCancelTargetId(entry.id);
            },
          },
        ]
      : [];
  }

  function entryTitle(entry: UnavailabilityHistoryEntry): string {
    return `${entry.leave_type} - ${formatWhen(entry)}`;
  }

  function renderStatus(entry: UnavailabilityHistoryEntry) {
    return (
      <span className={`${styles.status} ${styles[entry.status]}`}>
        {dayOffStatusLabel(entry.status)}
      </span>
    );
  }

  function renderSummary(entry: UnavailabilityHistoryEntry) {
    return (
      <div className={styles.summary}>
        <span className={styles.summaryTitle}>{entry.leave_type}</span>
        {renderStatus(entry)}
        <span className={styles.summaryMeta}>{formatWhen(entry)}</span>
        <span className={styles.summaryMeta}>
          {entry.reviewer_name
            ? `Reviewed by ${entry.reviewer_name}`
            : entry.status === 'pending'
              ? `Sent to ${entry.requested_reviewer_name ?? 'any manager'}`
              : 'No reviewer'}
        </span>
      </div>
    );
  }

  // Table/List: a persistent "..." trigger - only when there is something
  // to do, so finished rows don't carry an empty menu.
  function renderRowMenu(entry: UnavailabilityHistoryEntry) {
    const items = entryMenuItems(entry);
    return items.length > 0 ? (
      <MoreOptionsMenu
        label={`Actions for ${entryTitle(entry)}`}
        items={items}
      />
    ) : null;
  }

  // Gallery/Board/Calendar: right-click / press-and-hold, like every other
  // card view.
  function renderContextCard(
    entry: UnavailabilityHistoryEntry,
    content: ReactNode
  ) {
    const items = entryMenuItems(entry);
    return items.length > 0 ? (
      <CardContextMenu label={`Actions for ${entryTitle(entry)}`} items={items}>
        {content}
      </CardContextMenu>
    ) : (
      content
    );
  }

  const columns: DataTableColumn<UnavailabilityHistoryEntry>[] = [
    { id: 'when', header: 'Dates', render: formatWhen },
    { id: 'type', header: 'Type', render: (entry) => entry.leave_type },
    { id: 'status', header: 'Status', render: renderStatus },
    { id: 'reason', header: 'Reason', render: (entry) => entry.reason ?? '-' },
    {
      id: 'sentTo',
      header: 'Sent to',
      render: (entry) => entry.requested_reviewer_name ?? 'Any manager',
    },
    {
      id: 'reviewer',
      header: 'Reviewer',
      render: (entry) => entry.reviewer_name ?? '-',
    },
    {
      id: 'reviewed',
      header: 'Reviewed',
      render: (entry) =>
        entry.reviewed_at ? formatDateTime(entry.reviewed_at) : '-',
    },
    {
      id: 'requested',
      header: 'Requested',
      render: (entry) => formatDateTime(entry.created_at),
    },
    {
      id: 'denial',
      header: 'Denial reason',
      render: (entry) => entry.denial_reason ?? '-',
    },
  ];

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your day off requests.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Loading your day off requests..." />
      </main>
    );
  }

  if (loadError || !profile) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError ?? 'Unable to load your day off requests.'}
        </p>
      </main>
    );
  }

  const emptyMessage = 'No requests match this filter.';

  return (
    <main
      className={
        view === 'board' ? `${styles.page} ${styles.pageWide}` : styles.page
      }
    >
      <div className={styles.header}>
        <h1 className={styles.title}>Day Off Requests</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setMessage(null);
            setIsFormOpen(true);
          }}
        >
          New Request
        </button>
      </div>

      {message ? (
        <p className={styles.successBanner} role="status">
          {message}
        </p>
      ) : null}

      {actionError && cancelTargetId === null ? (
        <p className={styles.errorBanner} role="alert">
          {actionError}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className={styles.copy}>
          No day off requests yet. Tap New Request to make one.
        </p>
      ) : (
        <>
          <FilterSortBar
            filterFields={filterFields}
            filterTiles={filterTiles}
            onAddFilter={handleAddFilter}
            onChangeFilter={handleChangeFilter}
            onRemoveFilter={handleRemoveFilter}
            sortFields={DAY_OFF_SORT_FIELDS}
            sortTile={sortTile}
            onChangeSort={setSortTile}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search your requests..."
          >
            <ViewSwitcher
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Day off requests view"
            />
          </FilterSortBar>

          {view === 'table' ? (
            <DataTable
              columns={columns}
              rows={visibleEntries}
              getRowKey={(entry) => entry.id}
              renderRowActions={renderRowMenu}
              getRowContextMenu={(entry) => ({
                label: `Actions for ${entryTitle(entry)}`,
                items: entryMenuItems(entry),
              })}
              emptyMessage={emptyMessage}
            />
          ) : view === 'list' ? (
            <DataList
              items={visibleEntries}
              getRowKey={(entry) => entry.id}
              renderItem={(entry) =>
                renderContextCard(
                  entry,
                  <div className={styles.listRow}>
                    {renderSummary(entry)}
                    {renderRowMenu(entry)}
                  </div>
                )
              }
              emptyMessage={emptyMessage}
            />
          ) : view === 'gallery' ? (
            visibleEntries.length === 0 ? (
              <p className={styles.copy}>{emptyMessage}</p>
            ) : (
              <ul className={styles.gallery}>
                {visibleEntries.map((entry) => (
                  <li key={entry.id} className={styles.galleryCard}>
                    {renderContextCard(entry, renderSummary(entry))}
                  </li>
                ))}
              </ul>
            )
          ) : view === 'board' ? (
            <section
              className={styles.boardPanel}
              aria-label="Day off requests board"
            >
              <label className={styles.viewOption}>
                <span className={styles.filterLabel}>Group by</span>
                <select
                  className={styles.filterSelect}
                  value={groupAxisId}
                  onChange={(event) => setGroupAxisId(event.target.value)}
                  aria-label="Group by"
                >
                  {groupByAxes.map((axis) => (
                    <option key={axis.id} value={axis.id}>
                      {axis.label}
                    </option>
                  ))}
                </select>
              </label>
              <DataBoard
                groups={groupedEntries}
                getRowKey={(entry) => entry.id}
                renderCard={(entry) => (
                  <div className={styles.boardCard}>
                    {renderContextCard(entry, renderSummary(entry))}
                  </div>
                )}
                emptyColumnMessage="No requests here."
                wrapColumns
              />
            </section>
          ) : (
            <>
              <label className={styles.viewOption}>
                <span className={styles.filterLabel}>Calendar range</span>
                <select
                  className={styles.filterSelect}
                  value={calendarMode}
                  onChange={(event) =>
                    setCalendarMode(event.target.value as CalendarMode)
                  }
                  aria-label="Calendar range"
                >
                  <option value="month">Month</option>
                  <option value="week">Week</option>
                </select>
              </label>
              <DataCalendar
                mode={calendarMode}
                anchorDate={calendarAnchor}
                onAnchorDateChange={setCalendarAnchor}
                items={visibleEntries}
                getItemDate={dayOffCalendarDateKey}
                getRowKey={(entry) => entry.id}
                renderChip={(entry) =>
                  renderContextCard(
                    entry,
                    <span
                      className={`${styles.calendarChip} ${styles[entry.status]}`}
                      title={entryTitle(entry)}
                    >
                      {entry.leave_type} ({dayOffStatusLabel(entry.status)})
                    </span>
                  )
                }
              />
            </>
          )}
        </>
      )}

      <Modal
        isOpen={isFormOpen}
        title="New day off request"
        onClose={() => setIsFormOpen(false)}
      >
        {isFormOpen ? (
          <UnavailabilityBlockForm
            staffId={profile.id}
            accessToken={accessToken}
            onCreated={handleCreated}
            showReviewerPicker
          />
        ) : null}
      </Modal>

      <Modal
        isOpen={editTarget !== null}
        title="Edit day off request"
        onClose={() => setEditTarget(null)}
      >
        {editTarget ? (
          <UnavailabilityBlockForm
            key={editTarget.id}
            staffId={profile.id}
            accessToken={accessToken}
            onCreated={handleEdited}
            editingBlock={editTarget}
            showReviewerPicker
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={cancelTargetId !== null}
        title="Cancel this day off request?"
        tone="danger"
        confirmLabel="Yes, cancel it"
        cancelLabel="Keep request"
        isConfirming={isCancelling}
        onCancel={() => {
          setCancelTargetId(null);
          setActionError(null);
        }}
        onConfirm={() => void confirmCancel()}
        body={
          <>
            <p>
              Your request will be withdrawn and your manager won&apos;t need to
              review it. It stays in your history as Cancelled, and you can
              always make a new one.
            </p>
            {actionError ? (
              <p className={styles.errorBanner} role="alert">
                {actionError}
              </p>
            ) : null}
          </>
        }
      />
    </main>
  );
}
