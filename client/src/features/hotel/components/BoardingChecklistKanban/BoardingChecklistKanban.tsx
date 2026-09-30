import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Columns3,
  Footprints,
  LayoutGrid,
  List as ListIcon,
  Pill,
  PlayCircle,
  Table as TableIcon,
  Utensils,
} from 'lucide-react';
import {
  completeCareLogEntry,
  getCareLogEntries,
  reopenCareLogEntry,
  startCareLogEntry,
} from '../../api/hotel.api';
import { getPet } from '../../../customers/api/customer.api';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  DateRangeValue,
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { CareLogEntry, CareLogEntryStatus } from '../../hotel.types';
import {
  ALL_DATES_FROM,
  applyChecklistFilters,
  buildChecklistFilterFields,
  CHECKLIST_COMPARATORS,
  CHECKLIST_GROUP_BY_AXES,
  CHECKLIST_SORT_FIELDS,
  DEFAULT_DATE_TILE,
  deriveChecklistServerParams,
  deriveChecklistSortKey,
  matchesChecklistQuery,
  type CareType,
  type Row,
} from './boardingChecklistBrowserFields';
import styles from './BoardingChecklistKanban.module.css';

interface BoardingChecklistKanbanProps {
  accessToken: string;
  /** Daycare Queue redesign: scopes the whole board to one pet's tasks -
   * set when this page is reached from a checked-in Daycare Queue row
   * (?petId=...). Forces the Hotel/Daycare tab to Daycare and hides the
   * switcher entirely (there's nothing to switch between when every task
   * shown already belongs to this one pet). */
  petId?: string;
  /** "Open this booking": scopes the board to one stay's tasks (a stay is
   * exactly one booking - hotel_stays.booking_id is UNIQUE) across every
   * date, and hides the Hotel/Daycare tabs. */
  stayId?: string;
  /** Called with a stay id by a task's "Open this booking" action, or with
   * null by "Show all bookings". The page owns the ?stayId= URL param, so
   * omitting this hides both actions. */
  onOpenBooking?: (stayId: string | null) => void;
}

type StayTypeTab = 'Hotel' | 'Daycare';
type ViewMode = 'table' | 'list' | 'gallery' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { value: 'board', label: 'Board', icon: Columns3 },
];

const SEARCH_PLACEHOLDER = 'Search by pet name or task...';

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

function columnBorderClass(groupBy: string, column: string): string {
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

/** The checkbox's own next step, as a menu label - null for the read-only
 * statuses, which the menu then simply omits. */
function statusActionLabel(status: CareLogEntryStatus): string | null {
  switch (status) {
    case 'Pending':
      return 'Start';
    case 'In Progress':
      return 'Mark complete';
    case 'Completed':
      return 'Reopen';
    default:
      return null;
  }
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
 *
 * Config-menu consistency change: the toolbar is now the same FilterSortBar
 * + ViewSwitcher as My Bookings / Activity Log (Table, List, Gallery,
 * Board - Board grouped by Status stays the default, so the page opens
 * looking the same). Table and List rows carry a visible "..." menu;
 * Gallery and Board cards open the same menu by right-click /
 * press-and-hold. The menu repeats the checkbox's own next step, toggles
 * details, and offers "Open this booking" (see `stayId`).
 */
export function BoardingChecklistKanban({
  accessToken,
  petId,
  stayId,
  onOpenBooking,
}: BoardingChecklistKanbanProps) {
  const [entries, setEntries] = useState<CareLogEntry[]>([]);
  const [petNames, setPetNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stayTypeTab, setStayTypeTab] = useState<StayTypeTab>(
    petId ? 'Daycare' : 'Hotel'
  );
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([
    DEFAULT_DATE_TILE,
  ]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('board');
  const [groupAxisId, setGroupAxisId] = useState('status');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  // A booking's own scope ignores the Date tile entirely - a multi-day Hotel
  // stay should show every one of its days, not just today's slice.
  const visibleTiles = useMemo(
    () =>
      stayId
        ? filterTiles.filter((tile) => tile.fieldId !== 'date')
        : filterTiles,
    [filterTiles, stayId]
  );
  const dateTile = visibleTiles.find((tile) => tile.fieldId === 'date');
  // Keyed on the Date tile alone - every other tile filters client-side, so
  // adding a Status/Pet/etc. tile must not trigger a refetch.
  const dateTileKey = JSON.stringify(dateTile?.value ?? null);
  const serverParams = useMemo(() => {
    if (stayId) return { dateFrom: ALL_DATES_FROM };
    const value = JSON.parse(dateTileKey) as FilterValue;
    return deriveChecklistServerParams(
      value ? [{ fieldId: 'date', value }] : []
    );
  }, [dateTileKey, stayId]);

  const showDateBadge =
    (dateTile?.value as DateRangeValue | undefined)?.preset !== 'today';

  useEffect(() => {
    let isMounted = true;

    void getCareLogEntries(accessToken, serverParams).then((result) => {
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
  }, [accessToken, serverParams]);

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

  const scopedEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (stayId) return entry.stay_id === stayId;
        if (entry.stays?.stay_type !== stayTypeTab) return false;
        if (petId && entry.stays?.pet_id !== petId) return false;
        return true;
      }),
    [entries, stayTypeTab, petId, stayId]
  );

  const rows = useMemo<Row[]>(
    () =>
      scopedEntries.map((entry) => ({
        entry,
        petName: entry.stays?.pet_id
          ? (petNames[entry.stays.pet_id] ?? 'Pet')
          : 'Pet',
      })),
    [scopedEntries, petNames]
  );

  const filterFields = useMemo(() => {
    const fields = buildChecklistFilterFields(rows);
    return stayId ? fields.filter((field) => field.id !== 'date') : fields;
  }, [rows, stayId]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? rows.filter((row) => matchesChecklistQuery(row, query))
      : rows;
    const filtered = applyChecklistFilters(searched, visibleTiles);
    return [...filtered].sort(
      CHECKLIST_COMPARATORS[deriveChecklistSortKey(sortTile)]
    );
  }, [rows, search, visibleTiles, sortTile]);

  const activeGroupAxis =
    CHECKLIST_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ??
    CHECKLIST_GROUP_BY_AXES[0];
  const groups = useGroupBy(visibleRows, activeGroupAxis);

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

  function taskMenuItems({ entry }: Row): MoreOptionsMenuItem[] {
    const items: MoreOptionsMenuItem[] = [];
    const actionLabel = statusActionLabel(entry.status);

    if (actionLabel) {
      items.push({
        label: actionLabel,
        onSelect: () => handleCheckboxClick(entry),
      });
    }
    // The table has no expandable detail panel to toggle.
    if (view !== 'table') {
      items.push({
        label: expandedIds.has(entry.id) ? 'Hide details' : 'Show details',
        onSelect: () => toggleExpanded(entry.id),
      });
    }
    if (onOpenBooking) {
      items.push(
        stayId
          ? {
              label: 'Show all bookings',
              onSelect: () => onOpenBooking(null),
            }
          : {
              label: 'Open this booking',
              onSelect: () => onOpenBooking(entry.stay_id),
            }
      );
    }

    return items;
  }

  function menuLabel({ entry, petName }: Row): string {
    return `Actions for ${petName}: ${entry.description}`;
  }

  function renderCheckbox(entry: CareLogEntry) {
    const isCompleted = entry.status === 'Completed';

    return (
      <button
        type="button"
        aria-label={checkboxAriaLabel(entry)}
        aria-pressed={isCompleted}
        disabled={
          pendingActionId === entry.id || isReadOnlyStatus(entry.status)
        }
        className={`${styles.checkbox} ${
          isCompleted ? styles.checkboxChecked : ''
        } ${entry.status === 'In Progress' ? styles.checkboxInProgress : ''} ${
          entry.status === 'Missed' ? styles.checkboxMissed : ''
        } ${entry.status === 'Backlog' ? styles.checkboxBacklog : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          handleCheckboxClick(entry);
        }}
      />
    );
  }

  function renderCategoryBadge(entry: CareLogEntry) {
    const Icon = CATEGORY_ICON[entry.care_type];
    return (
      <span
        className={`${styles.categoryBadge} ${categoryBadgeClass(
          entry.care_type
        )}`}
      >
        <Icon size={11} aria-hidden="true" />
        {entry.care_type}
      </span>
    );
  }

  function renderStatusBadge(entry: CareLogEntry) {
    return (
      <span
        className={`${styles.statusBadge} ${statusBadgeClass(entry.status)}`}
      >
        {entry.status}
      </span>
    );
  }

  /** Checkbox + expandable body - shared by the Board, Gallery and List
   * views (only the surrounding card/row chrome differs). */
  function renderTaskContent({ entry, petName }: Row) {
    const isMissed = entry.status === 'Missed';
    const isBacklog = entry.status === 'Backlog';
    const isExpanded = expandedIds.has(entry.id);
    const [title, detail] = splitDescription(entry.description);
    // A status column already says the status - every other layout needs
    // the badge.
    const showStatusBadge = view !== 'board' || groupAxisId !== 'status';

    return (
      <div className={styles.cardHeader}>
        {renderCheckbox(entry)}
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
            <span className={styles.descriptionDetail}>{detail}</span>
          ) : null}
          <span className={styles.metaRow}>
            {renderCategoryBadge(entry)}
            {entry.time_block ? (
              <span className={styles.timeBadge}>{entry.time_block}</span>
            ) : null}
            {showDateBadge ? (
              <span className={styles.dateBadge}>
                {formatShortDate(entry.scheduled_date)}
              </span>
            ) : null}
            {showStatusBadge ? renderStatusBadge(entry) : null}
          </span>

          {isExpanded ? (
            <div className={styles.expandedDetails}>
              <span>Scheduled: {formatFullDate(entry.scheduled_date)}</span>
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
                  This task&apos;s date has passed - it can no longer be
                  updated.
                </span>
              ) : null}
              {isBacklog ? (
                <span className={styles.backlogNote}>
                  Not due until {formatFullDate(entry.scheduled_date)} - it will
                  move to Pending automatically.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Gallery/Board: right-click / press-and-hold opens the task menu - a
  // kebab on every card in a dense grid is visual noise (same precedent as
  // Staff/Customer Management and My Bookings).
  function renderContextCard(row: Row) {
    return (
      <CardContextMenu label={menuLabel(row)} items={taskMenuItems(row)}>
        <div className={styles.card}>{renderTaskContent(row)}</div>
      </CardContextMenu>
    );
  }

  // Table/List: a persistent "..." trigger.
  function renderRowMenu(row: Row) {
    return (
      <MoreOptionsMenu label={menuLabel(row)} items={taskMenuItems(row)} />
    );
  }

  const tableColumns: DataTableColumn<Row>[] = [
    {
      id: 'done',
      header: 'Done',
      render: (row) => renderCheckbox(row.entry),
    },
    { id: 'pet', header: 'Pet', render: (row) => row.petName },
    {
      id: 'task',
      header: 'Task',
      render: (row) => {
        const [title, detail] = splitDescription(row.entry.description);
        return (
          <span className={styles.tableTask}>
            <span className={styles.description}>{title}</span>
            {detail ? (
              <span className={styles.descriptionDetail}>{detail}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      render: (row) => renderCategoryBadge(row.entry),
    },
    {
      id: 'time',
      header: 'Time',
      render: (row) => row.entry.time_block ?? '—',
    },
    {
      id: 'date',
      header: 'Date',
      render: (row) => formatShortDate(row.entry.scheduled_date),
    },
    {
      id: 'status',
      header: 'Status',
      render: (row) => renderStatusBadge(row.entry),
    },
  ];

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

  const scopedStay = stayId ? rows[0] : undefined;
  const emptyMessage = 'No tasks match this filter.';

  return (
    <div className={styles.wrapper}>
      {stayId ? (
        <div className={styles.scopeBar}>
          <span>
            Showing only{' '}
            {scopedStay
              ? `${scopedStay.petName}'s ${
                  scopedStay.entry.stays?.stay_type ?? ''
                } booking`
              : 'one booking'}
          </span>
          {onOpenBooking ? (
            <button
              type="button"
              className={styles.scopeClear}
              onClick={() => onOpenBooking(null)}
            >
              Show all bookings
            </button>
          ) : null}
        </div>
      ) : !petId ? (
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
            className={
              stayTypeTab === 'Daycare' ? styles.tabActive : styles.tab
            }
            onClick={() => setStayTypeTab('Daycare')}
          >
            Daycare
          </button>
        </div>
      ) : null}

      <FilterSortBar
        filterFields={filterFields}
        filterTiles={visibleTiles}
        onAddFilter={handleAddFilter}
        onChangeFilter={handleChangeFilter}
        onRemoveFilter={handleRemoveFilter}
        sortFields={CHECKLIST_SORT_FIELDS}
        sortTile={sortTile}
        onChangeSort={setSortTile}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={SEARCH_PLACEHOLDER}
      >
        <div className={styles.viewControls}>
          <ViewSwitcher
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            ariaLabel="Checklist view"
          />
          {view === 'board' ? (
            <label className={styles.toggleField}>
              <span>Group by</span>
              <select
                className={styles.groupBySelect}
                value={groupAxisId}
                onChange={(event) => setGroupAxisId(event.target.value)}
                aria-label="Group by"
              >
                {CHECKLIST_GROUP_BY_AXES.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    {axis.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </FilterSortBar>

      <p className={styles.resultCount}>
        {visibleRows.length} task
        {visibleRows.length === 1 ? '' : 's'}
      </p>

      {view === 'table' ? (
        <DataTable
          columns={tableColumns}
          rows={visibleRows}
          getRowKey={(row) => row.entry.id}
          renderRowActions={renderRowMenu}
          emptyMessage={emptyMessage}
        />
      ) : view === 'list' ? (
        <DataList
          items={visibleRows}
          getRowKey={(row) => row.entry.id}
          renderItem={(row) => (
            <div className={styles.listRow}>
              <div className={styles.listMain}>{renderTaskContent(row)}</div>
              {renderRowMenu(row)}
            </div>
          )}
          emptyMessage={emptyMessage}
        />
      ) : view === 'gallery' ? (
        visibleRows.length === 0 ? (
          <p className={styles.copy}>{emptyMessage}</p>
        ) : (
          <ul className={styles.gallery}>
            {visibleRows.map((row) => (
              <li key={row.entry.id}>{renderContextCard(row)}</li>
            ))}
          </ul>
        )
      ) : (
        <div
          className={styles.board}
          style={{ '--column-count': groups.length } as CSSProperties}
        >
          {groups.map(({ column, items }) => (
            <div
              key={column}
              className={`${styles.column} ${columnBorderClass(
                activeGroupAxis.id,
                column
              )}`}
            >
              <h2 className={styles.columnTitle}>
                {column}
                <span className={styles.columnCount}>{items.length}</span>
              </h2>

              {items.length === 0 ? (
                <p className={styles.copy}>Nothing here.</p>
              ) : null}

              {items.map((row) => (
                <div key={row.entry.id}>{renderContextCard(row)}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
