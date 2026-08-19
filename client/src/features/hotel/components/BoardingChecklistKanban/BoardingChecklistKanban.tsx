import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Footprints, Pill, PlayCircle, Utensils } from 'lucide-react';
import {
  completeCareLogEntry,
  getCareLogEntries,
  reopenCareLogEntry,
  startCareLogEntry,
} from '../../api/hotel.api';
import { getPet } from '../../../customers/api/customer.api';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  dateRangePresetLabel,
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import type {
  CareLogEntry,
  CareLogEntryStatus,
  MealTime,
} from '../../hotel.types';
import styles from './BoardingChecklistKanban.module.css';

interface BoardingChecklistKanbanProps {
  accessToken: string;
}

type StayTypeTab = 'Hotel' | 'Daycare';
type CareType = CareLogEntry['care_type'];
type CareTypeFilter = 'All' | CareType;
type SortKey = 'soonest' | 'latest' | 'pet-name';
type GroupBy = 'status' | 'time' | 'category';

interface Row {
  entry: CareLogEntry;
  petName: string;
}

const STATUS_COLUMNS: CareLogEntryStatus[] = [
  'Backlog',
  'Pending',
  'In Progress',
  'Completed',
  'Missed',
];

const TIME_BLOCK_ORDER: MealTime[] = [
  'Morning',
  'Noon',
  'Afternoon',
  'Evening',
];

const TIME_COLUMNS: string[] = [...TIME_BLOCK_ORDER, 'Unscheduled'];

const CATEGORY_COLUMNS: CareType[] = [
  'Feeding',
  'Walking',
  'Playing',
  'Medication',
];

const CATEGORY_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All categories' },
  { value: 'Feeding', label: 'Feeding' },
  { value: 'Walking', label: 'Walking' },
  { value: 'Playing', label: 'Playing' },
  { value: 'Medication', label: 'Medication' },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'soonest', label: 'Sort: Soonest first' },
  { value: 'latest', label: 'Sort: Latest first' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
];

const GROUP_BY_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'time', label: 'Time of day' },
  { value: 'category', label: 'Instructions (category)' },
];

const CATEGORY_ICON: Record<CareType, typeof Utensils> = {
  Feeding: Utensils,
  Walking: Footprints,
  Playing: PlayCircle,
  Medication: Pill,
};

function categoryBadgeClass(type: CareType): string {
  switch (type) {
    case 'Feeding':
      return styles.categoryFeeding;
    case 'Walking':
      return styles.categoryWalking;
    case 'Playing':
      return styles.categoryPlaying;
    case 'Medication':
      return styles.categoryMedication;
  }
}

function statusBadgeClass(status: CareLogEntryStatus): string {
  switch (status) {
    case 'Backlog':
      return styles.statusBacklog;
    case 'Pending':
      return styles.statusPending;
    case 'In Progress':
      return styles.statusInProgress;
    case 'Completed':
      return styles.statusCompleted;
    case 'Missed':
      return styles.statusMissed;
  }
}

function columnsForGroupBy(groupBy: GroupBy): string[] {
  if (groupBy === 'status') return STATUS_COLUMNS;
  if (groupBy === 'time') return TIME_COLUMNS;
  return CATEGORY_COLUMNS;
}

function rowMatchesColumn(row: Row, groupBy: GroupBy, column: string): boolean {
  if (groupBy === 'status') return row.entry.status === column;
  if (groupBy === 'time')
    return (row.entry.time_block ?? 'Unscheduled') === column;
  return row.entry.care_type === column;
}

function columnBorderClass(groupBy: GroupBy, column: string): string {
  if (groupBy === 'status') {
    switch (column as CareLogEntryStatus) {
      case 'Backlog':
        return styles.columnBacklog;
      case 'Pending':
        return styles.columnPending;
      case 'In Progress':
        return styles.columnInProgress;
      case 'Completed':
        return styles.columnCompleted;
      case 'Missed':
        return styles.columnMissed;
    }
  }
  if (groupBy === 'category') {
    switch (column as CareType) {
      case 'Feeding':
        return styles.columnFeeding;
      case 'Walking':
        return styles.columnWalking;
      case 'Playing':
        return styles.columnPlaying;
      case 'Medication':
        return styles.columnMedication;
    }
  }
  return styles.columnNeutral;
}

function timeBlockIndex(timeBlock: MealTime | null): number {
  return timeBlock
    ? TIME_BLOCK_ORDER.indexOf(timeBlock)
    : TIME_BLOCK_ORDER.length;
}

function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** The em-dash-delimited shape every care_type description is generated in
 * (careInstructions.service.ts's generateCareLogEntries) - e.g. "Amoxicillin
 * 250mg 1 — 8:00 AM" or "Morning walk — 15 min". Splitting it out lets the
 * card show the task's own detail (a duration, quantity, or exact time) on
 * its own line instead of buried in one run-on sentence. */
function splitDescription(description: string): [string, string | null] {
  const marker = ' — ';
  const index = description.indexOf(marker);
  if (index === -1) return [description, null];
  return [
    description.slice(0, index),
    description.slice(index + marker.length),
  ];
}

function checkboxAriaLabel(entry: CareLogEntry): string {
  switch (entry.status) {
    case 'Backlog':
      return `Not due yet (read-only): ${entry.description}`;
    case 'Pending':
      return `Start: ${entry.description}`;
    case 'In Progress':
      return `Mark complete: ${entry.description}`;
    case 'Completed':
      return `Reopen: ${entry.description}`;
    case 'Missed':
      return `Missed (read-only): ${entry.description}`;
  }
}

function isReadOnlyStatus(status: CareLogEntryStatus): boolean {
  return status === 'Backlog' || status === 'Missed';
}

/**
 * Boarding Checklist Kanban - interaction redesign. The circular checkbox is
 * now the only control on a card (no separate Start/Back-to-Pending
 * buttons): clicking it advances the task one step (Pending -> In Progress
 * -> Completed); clicking a Completed (checked) box reopens it straight back
 * to Pending, not to In Progress - there's no "uncheck to the previous step"
 * distinction to preserve since In Progress is never rendered as checked.
 * Backlog and Missed are both fully read-only (checkbox disabled) - a task
 * that isn't due yet and a task whose date has already passed are equally
 * nothing the checkbox can act on right now, just at opposite ends of the
 * timeline. Clicking anywhere else on a card expands/collapses its detail
 * panel (scheduled date, completion record).
 *
 * Grouping is a single selectable axis (Status/Time of day/Category), not a
 * fixed status-column layout with an optional time sub-group - matches
 * Todoist's own "group by" model more closely than the original status-only
 * board did.
 *
 * The previous version replaced the whole `entries` array item with a
 * mutation's response, which - before the server was widened to return the
 * same joined shape getCareLogEntries uses - silently dropped the row from
 * every column (it failed the Hotel/Daycare stay_type filter the moment its
 * `stays` field went missing). `replaceEntry` below still merges rather than
 * replaces, as defense in depth against any future response that isn't
 * fully joined.
 */
export function BoardingChecklistKanban({
  accessToken,
}: BoardingChecklistKanbanProps) {
  const [entries, setEntries] = useState<CareLogEntry[]>([]);
  const [petNames, setPetNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stayTypeTab, setStayTypeTab] = useState<StayTypeTab>('Hotel');
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [categoryFilter, setCategoryFilter] = useState<CareTypeFilter>('All');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );
  const showDateBadge = dateRangePreset !== 'today';

  useEffect(() => {
    let isMounted = true;

    void getCareLogEntries(accessToken, {
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

      const petIds = [
        ...new Set(
          result.data
            .map((entry) => entry.stays?.pet_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      void Promise.all(petIds.map((id) => getPet(id, accessToken))).then(
        (petResults) => {
          if (!isMounted) return;
          setPetNames((prev) => {
            const next = { ...prev };
            for (const petResult of petResults) {
              if (petResult.data) next[petResult.data.id] = petResult.data.name;
            }
            return next;
          });
        }
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, dateRange.from, dateRange.to]);

  function replaceEntry(updated: CareLogEntry) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === updated.id ? { ...entry, ...updated } : entry
      )
    );
  }

  async function runAction(
    entryId: string,
    action: (
      id: string,
      token: string
    ) => Promise<{ data: CareLogEntry | null; error: string | null }>
  ) {
    setPendingActionId(entryId);
    const result = await action(entryId, accessToken);
    setPendingActionId(null);
    if (result.data) replaceEntry(result.data);
  }

  function handleCheckboxClick(entry: CareLogEntry) {
    if (entry.status === 'Pending') {
      void runAction(entry.id, startCareLogEntry);
    } else if (entry.status === 'In Progress') {
      void runAction(entry.id, completeCareLogEntry);
    } else if (entry.status === 'Completed') {
      void runAction(entry.id, reopenCareLogEntry);
    }
    // Missed: read-only, the button is disabled so this is unreachable.
  }

  function toggleExpanded(entryId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  const stayAndCategoryFiltered = useMemo(
    () =>
      entries.filter((entry) => {
        if (entry.stays?.stay_type !== stayTypeTab) return false;
        if (categoryFilter !== 'All' && entry.care_type !== categoryFilter) {
          return false;
        }
        return true;
      }),
    [entries, stayTypeTab, categoryFilter]
  );

  const rows = useMemo<Row[]>(
    () =>
      stayAndCategoryFiltered.map((entry) => ({
        entry,
        petName: entry.stays?.pet_id
          ? (petNames[entry.stays.pet_id] ?? 'Pet')
          : 'Pet',
      })),
    [stayAndCategoryFiltered, petNames]
  );

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: filteredAndSorted,
  } = useSearchAndSort<Row, SortKey>({
    items: rows,
    matchesQuery: (row, query) =>
      row.petName.toLowerCase().includes(query) ||
      row.entry.description.toLowerCase().includes(query),
    comparators: {
      soonest: (a, b) => {
        const dateDiff = a.entry.scheduled_date.localeCompare(
          b.entry.scheduled_date
        );
        return dateDiff !== 0
          ? dateDiff
          : timeBlockIndex(a.entry.time_block) -
              timeBlockIndex(b.entry.time_block);
      },
      latest: (a, b) => {
        const dateDiff = b.entry.scheduled_date.localeCompare(
          a.entry.scheduled_date
        );
        return dateDiff !== 0
          ? dateDiff
          : timeBlockIndex(b.entry.time_block) -
              timeBlockIndex(a.entry.time_block);
      },
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'soonest',
  });

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];

    if (dateRangePreset !== 'today') {
      chips.push({
        id: 'date',
        label: `Date: ${dateRangePresetLabel(dateRangePreset)}`,
        onClear: () => setDateRangePreset('today'),
      });
    }
    if (categoryFilter !== 'All') {
      chips.push({
        id: 'category',
        label: `Category: ${categoryFilter}`,
        onClear: () => setCategoryFilter('All'),
      });
    }
    if (groupBy !== 'status') {
      chips.push({
        id: 'groupBy',
        label: `Group by: ${
          GROUP_BY_OPTIONS.find((option) => option.value === groupBy)?.label ??
          groupBy
        }`,
        onClear: () => setGroupBy('status'),
      });
    }
    if (search.trim() !== '') {
      chips.push({
        id: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    if (sortKey !== 'soonest') {
      chips.push({
        id: 'sort',
        label:
          SORT_OPTIONS.find((option) => option.value === sortKey)?.label ??
          sortKey,
        onClear: () => setSortKey('soonest'),
      });
    }

    return chips;
  }, [
    dateRangePreset,
    categoryFilter,
    groupBy,
    search,
    sortKey,
    setSearch,
    setSortKey,
  ]);

  const columns = columnsForGroupBy(groupBy);

  function rowsForColumn(column: string): Row[] {
    return filteredAndSorted.filter((row) =>
      rowMatchesColumn(row, groupBy, column)
    );
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading the Boarding Checklist...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={stayTypeTab === 'Hotel'}
          className={stayTypeTab === 'Hotel' ? styles.tabActive : styles.tab}
          onClick={() => setStayTypeTab('Hotel')}
        >
          Hotel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={stayTypeTab === 'Daycare'}
          className={stayTypeTab === 'Daycare' ? styles.tabActive : styles.tab}
          onClick={() => setStayTypeTab('Daycare')}
        >
          Daycare
        </button>
      </div>

      <QueueFilterBar
        dateRangePreset={dateRangePreset}
        onDateRangePresetChange={setDateRangePreset}
        customDate={customDate}
        onCustomDateChange={setCustomDate}
        statusValue={categoryFilter}
        onStatusChange={(value) => setCategoryFilter(value as CareTypeFilter)}
        statusOptions={CATEGORY_OPTIONS}
        statusLabel="Category"
      >
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by pet name or task..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
        <label className={styles.toggleField}>
          <span>Group by</span>
          <select
            className={styles.groupBySelect}
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            aria-label="Group by"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </QueueFilterBar>

      <ActiveFilterChips chips={filterChips} />

      <p className={styles.resultCount}>
        {filteredAndSorted.length} task
        {filteredAndSorted.length === 1 ? '' : 's'}
      </p>

      <div
        className={styles.board}
        style={{ '--column-count': columns.length } as CSSProperties}
      >
        {columns.map((column) => {
          const columnRows = rowsForColumn(column);

          return (
            <div
              key={column}
              className={`${styles.column} ${columnBorderClass(groupBy, column)}`}
            >
              <h2 className={styles.columnTitle}>
                {column}
                <span className={styles.columnCount}>{columnRows.length}</span>
              </h2>

              {columnRows.length === 0 ? (
                <p className={styles.copy}>Nothing here.</p>
              ) : null}

              {columnRows.map(({ entry, petName }) => {
                const Icon = CATEGORY_ICON[entry.care_type];
                const isBusy = pendingActionId === entry.id;
                const isCompleted = entry.status === 'Completed';
                const isMissed = entry.status === 'Missed';
                const isBacklog = entry.status === 'Backlog';
                const isExpanded = expandedIds.has(entry.id);
                const [title, detail] = splitDescription(entry.description);

                return (
                  <div key={entry.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <button
                        type="button"
                        aria-label={checkboxAriaLabel(entry)}
                        aria-pressed={isCompleted}
                        disabled={isBusy || isReadOnlyStatus(entry.status)}
                        className={`${styles.checkbox} ${
                          isCompleted ? styles.checkboxChecked : ''
                        } ${entry.status === 'In Progress' ? styles.checkboxInProgress : ''} ${
                          isMissed ? styles.checkboxMissed : ''
                        } ${isBacklog ? styles.checkboxBacklog : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCheckboxClick(entry);
                        }}
                      />
                      <div
                        className={styles.cardBody}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details: ${entry.description}`}
                        onClick={() => toggleExpanded(entry.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleExpanded(entry.id);
                          }
                        }}
                      >
                        <span className={styles.petName}>{petName}</span>
                        <span className={styles.description}>{title}</span>
                        {detail ? (
                          <span className={styles.descriptionDetail}>
                            {detail}
                          </span>
                        ) : null}
                        <span className={styles.metaRow}>
                          <span
                            className={`${styles.categoryBadge} ${categoryBadgeClass(
                              entry.care_type
                            )}`}
                          >
                            <Icon size={11} aria-hidden="true" />
                            {entry.care_type}
                          </span>
                          {entry.time_block ? (
                            <span className={styles.timeBadge}>
                              {entry.time_block}
                            </span>
                          ) : null}
                          {showDateBadge ? (
                            <span className={styles.dateBadge}>
                              {formatShortDate(entry.scheduled_date)}
                            </span>
                          ) : null}
                          {groupBy !== 'status' ? (
                            <span
                              className={`${styles.statusBadge} ${statusBadgeClass(
                                entry.status
                              )}`}
                            >
                              {entry.status}
                            </span>
                          ) : null}
                        </span>

                        {isExpanded ? (
                          <div className={styles.expandedDetails}>
                            <span>
                              Scheduled: {formatFullDate(entry.scheduled_date)}
                            </span>
                            {entry.status === 'Completed' ? (
                              <span>
                                Completed
                                {entry.completed_by_staff?.display_name
                                  ? ` by ${entry.completed_by_staff.display_name}`
                                  : ''}
                                {entry.completed_at
                                  ? ` on ${formatDateTime(entry.completed_at)}`
                                  : ''}
                              </span>
                            ) : null}
                            {isMissed ? (
                              <span className={styles.missedNote}>
                                This task&apos;s date has passed - it can no
                                longer be updated.
                              </span>
                            ) : null}
                            {isBacklog ? (
                              <span className={styles.backlogNote}>
                                Not due until{' '}
                                {formatFullDate(entry.scheduled_date)} - it will
                                move to Pending automatically.
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
