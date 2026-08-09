import { useEffect, useMemo, useState } from 'react';
import {
  completeCareLogEntry,
  getTodayCareLogEntries,
  reopenCareLogEntry,
  startCareLogEntry,
} from '../../api/hotel.api';
import { getPet } from '../../../customers/api/customer.api';
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
type SortDirection = 'asc' | 'desc';

const STATUS_COLUMNS: CareLogEntryStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
];

const TIME_BLOCK_ORDER: MealTime[] = [
  'Morning',
  'Noon',
  'Afternoon',
  'Evening',
];

function timeBlockIndex(timeBlock: MealTime | null): number {
  return timeBlock
    ? TIME_BLOCK_ORDER.indexOf(timeBlock)
    : TIME_BLOCK_ORDER.length;
}

/**
 * Custom change: Boarding Checklist Kanban view - replaces the old flat
 * CareLogChecklist list for Pet Assistant/Groomer. Hotel/Daycare are
 * subtabs (not a filter), the 3 columns ARE the Pending/In Progress/
 * Completed group-by (Kanban's whole point), and within each column cards
 * are optionally sub-grouped by time-of-day and always sorted by time-of-
 * day asc/desc - the two group-bys/sort called out as most important.
 * Circular checkbox (Todoist-style) completes/reopens a task directly;
 * a small "Start"/"Back to Pending" action covers the in-between step no
 * checkbox alone can express.
 */
export function BoardingChecklistKanban({
  accessToken,
}: BoardingChecklistKanbanProps) {
  const [entries, setEntries] = useState<CareLogEntry[]>([]);
  const [petNames, setPetNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stayTypeTab, setStayTypeTab] = useState<StayTypeTab>('Hotel');
  const [search, setSearch] = useState('');
  const [groupByTime, setGroupByTime] = useState(true);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getTodayCareLogEntries(accessToken).then((result) => {
      if (!isMounted) return;
      setIsLoading(false);

      if (!result.data) {
        setError(result.error);
        return;
      }

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
  }, [accessToken]);

  function replaceEntry(updated: CareLogEntry) {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === updated.id ? updated : entry))
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

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (entry.stays?.stay_type !== stayTypeTab) return false;
      if (!query) return true;

      const petName = entry.stays?.pet_id
        ? (petNames[entry.stays.pet_id] ?? '')
        : '';
      return (
        petName.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query)
      );
    });
  }, [entries, stayTypeTab, search, petNames]);

  function sortedForColumn(status: CareLogEntryStatus): CareLogEntry[] {
    const columnEntries = filteredEntries.filter(
      (entry) => entry.status === status
    );

    return [...columnEntries].sort((a, b) => {
      const diff = timeBlockIndex(a.time_block) - timeBlockIndex(b.time_block);
      return sortDirection === 'asc' ? diff : -diff;
    });
  }

  function groupedByTime(
    columnEntries: CareLogEntry[]
  ): Array<[MealTime | 'Unscheduled', CareLogEntry[]]> {
    const groups = new Map<MealTime | 'Unscheduled', CareLogEntry[]>();

    for (const entry of columnEntries) {
      const key = entry.time_block ?? 'Unscheduled';
      const existing = groups.get(key) ?? [];
      existing.push(entry);
      groups.set(key, existing);
    }

    return [...groups.entries()];
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading today's Boarding Checklist...</p>;
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

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by pet name..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search the Boarding Checklist"
        />

        <label className={styles.toggleField}>
          <input
            type="checkbox"
            checked={groupByTime}
            onChange={(event) => setGroupByTime(event.target.checked)}
          />
          Group by time of day
        </label>

        <label className={styles.toggleField}>
          <span>Sort by time</span>
          <select
            className={styles.sortSelect}
            value={sortDirection}
            onChange={(event) =>
              setSortDirection(event.target.value as SortDirection)
            }
            aria-label="Sort by time"
          >
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
          </select>
        </label>
      </div>

      <div className={styles.board}>
        {STATUS_COLUMNS.map((status) => {
          const columnEntries = sortedForColumn(status);
          const groups = groupByTime
            ? groupedByTime(columnEntries)
            : [[null, columnEntries] as [null, CareLogEntry[]]];

          return (
            <div key={status} className={styles.column}>
              <h2 className={styles.columnTitle}>
                {status}
                <span className={styles.columnCount}>
                  {columnEntries.length}
                </span>
              </h2>

              {columnEntries.length === 0 ? (
                <p className={styles.copy}>Nothing here.</p>
              ) : null}

              {groups.map(([groupKey, groupEntries]) => (
                <div key={groupKey ?? 'flat'} className={styles.timeGroup}>
                  {groupKey ? (
                    <h3 className={styles.timeGroupTitle}>{groupKey}</h3>
                  ) : null}

                  {groupEntries.map((entry) => {
                    const petName = entry.stays?.pet_id
                      ? (petNames[entry.stays.pet_id] ?? 'Pet')
                      : 'Pet';
                    const isBusy = pendingActionId === entry.id;
                    const isCompleted = entry.status === 'Completed';

                    return (
                      <div key={entry.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <button
                            type="button"
                            aria-label={
                              isCompleted
                                ? `Reopen: ${entry.description}`
                                : `Mark complete: ${entry.description}`
                            }
                            aria-pressed={isCompleted}
                            disabled={isBusy}
                            className={`${styles.checkbox} ${
                              isCompleted ? styles.checkboxChecked : ''
                            }`}
                            onClick={() =>
                              void runAction(
                                entry.id,
                                isCompleted
                                  ? reopenCareLogEntry
                                  : completeCareLogEntry
                              )
                            }
                          />
                          <div className={styles.cardBody}>
                            <span className={styles.petName}>{petName}</span>
                            <span className={styles.description}>
                              {entry.description}
                            </span>
                            <span className={styles.metaRow}>
                              <span className={styles.careTypeBadge}>
                                {entry.care_type}
                              </span>
                              {entry.time_block ? (
                                <span className={styles.timeBadge}>
                                  {entry.time_block}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>

                        {entry.status === 'Pending' ? (
                          <button
                            type="button"
                            className={styles.actionLink}
                            disabled={isBusy}
                            onClick={() =>
                              void runAction(entry.id, startCareLogEntry)
                            }
                          >
                            Start
                          </button>
                        ) : null}

                        {entry.status === 'In Progress' ? (
                          <button
                            type="button"
                            className={styles.actionLink}
                            disabled={isBusy}
                            onClick={() =>
                              void runAction(entry.id, reopenCareLogEntry)
                            }
                          >
                            Back to Pending
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
