import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getPet } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  dateRangePresetLabel,
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { listDaycareSessions } from '../../api/daycare.api';
import type { DaycareSession, DaycareStatus } from '../../daycare.types';
import styles from './DaycareSessionPicker.module.css';

type SortKey = 'check-in-earliest' | 'pet-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'check-in-earliest', label: 'Sort: Checked in (earliest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
];

const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'Active', label: 'Active' },
  { value: 'All', label: 'All statuses' },
  { value: 'Completed', label: 'Completed' },
];

interface EnrichedSession {
  session: DaycareSession;
  petName: string;
}

interface DaycareSessionPickerProps {
  accessToken: string;
  onSelect: (session: DaycareSession) => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Daycare Checkout's picker - mirrors HotelStayPicker's search/filter/sort
 * card list exactly (Custom change: Daycare checkout UI parity with Hotel).
 * Defaults to Active sessions - a Completed one has nothing left to check
 * out - but offers the same QueueFilterBar (date range + status) so staff
 * can widen the list to review already-checked-out sessions too. The date
 * filter defaults to "All dates" rather than "Today", same reasoning as
 * Hotel's: a session checked in earlier today (or, for an overnight walk-in,
 * even the day before) should stay visible by default.
 */
export function DaycareSessionPicker({
  accessToken,
  onSelect,
}: DaycareSessionPickerProps) {
  const navigate = useNavigate();
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('all');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<DaycareStatus | 'All'>(
    'Active'
  );

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [sessions, setSessions] = useState<DaycareSession[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listDaycareSessions(accessToken, {
      status: statusFilter === 'All' ? undefined : statusFilter,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    }).then((result) => {
      if (!isMounted) return;
      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load Daycare sessions.');
        return;
      }

      setError(null);
      setSessions(result.data);

      const petIds = new Set(result.data.map((session) => session.pet_id));
      void Promise.all(
        Array.from(petIds).map((id) => getPet(id, accessToken))
      ).then((petResults) => {
        if (!isMounted) return;
        const petMap: Record<string, Pet> = {};
        for (const petResult of petResults) {
          if (petResult.data) petMap[petResult.data.id] = petResult.data;
        }
        setPets(petMap);
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, dateRange.from, dateRange.to, statusFilter]);

  const enriched = useMemo<EnrichedSession[]>(
    () =>
      sessions.map((session) => ({
        session,
        petName: pets[session.pet_id]?.name ?? 'Unknown pet',
      })),
    [sessions, pets]
  );

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: filteredAndSorted,
  } = useSearchAndSort<EnrichedSession, SortKey>({
    items: enriched,
    matchesQuery: (item, query) => item.petName.toLowerCase().includes(query),
    comparators: {
      'check-in-earliest': (a, b) =>
        new Date(a.session.check_in_at ?? 0).getTime() -
        new Date(b.session.check_in_at ?? 0).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'check-in-earliest',
  });

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];

    if (dateRangePreset !== 'all') {
      chips.push({
        id: 'date',
        label: `Date: ${dateRangePresetLabel(dateRangePreset)}`,
        onClear: () => setDateRangePreset('all'),
      });
    }
    if (statusFilter !== 'Active') {
      chips.push({
        id: 'status',
        label: `Status: ${
          STATUS_OPTIONS.find((option) => option.value === statusFilter)
            ?.label ?? statusFilter
        }`,
        onClear: () => setStatusFilter('Active'),
      });
    }
    if (search.trim() !== '') {
      chips.push({
        id: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    if (sortKey !== 'check-in-earliest') {
      chips.push({
        id: 'sort',
        label:
          SORT_OPTIONS.find((option) => option.value === sortKey)?.label ??
          sortKey,
        onClear: () => setSortKey('check-in-earliest'),
      });
    }

    return chips;
  }, [dateRangePreset, statusFilter, search, sortKey, setSearch, setSortKey]);

  return (
    <div className={styles.wrapper}>
      <QueueFilterBar
        dateRangePreset={dateRangePreset}
        onDateRangePresetChange={setDateRangePreset}
        customDate={customDate}
        onCustomDateChange={setCustomDate}
        statusValue={statusFilter}
        onStatusChange={(value) =>
          setStatusFilter(value as DaycareStatus | 'All')
        }
        statusOptions={STATUS_OPTIONS}
      >
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by pet name..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </QueueFilterBar>

      <ActiveFilterChips chips={filterChips} />

      <p className={styles.resultCount}>
        {isLoading
          ? 'Loading sessions...'
          : `${filteredAndSorted.length} session${filteredAndSorted.length === 1 ? '' : 's'}`}
      </p>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && filteredAndSorted.length === 0 ? (
        <p className={styles.copy}>
          {sessions.length === 0 &&
          dateRangePreset === 'all' &&
          statusFilter === 'Active'
            ? 'No pets are currently checked in to Daycare.'
            : 'No sessions match these filters. Try widening the date range or status above.'}
        </p>
      ) : null}

      {!isLoading && filteredAndSorted.length > 0 ? (
        <ul className={styles.list}>
          {filteredAndSorted.map((item) => {
            const isCheckoutable = item.session.status === 'Active';

            return (
              <li key={item.session.id}>
                <div
                  className={`${styles.card} ${
                    !isCheckoutable ? styles.disabledCard : ''
                  }`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.petName}>{item.petName}</span>
                    {!isCheckoutable ? (
                      <span className={styles.checkedOutBadge}>
                        Already checked out
                      </span>
                    ) : null}
                    {item.session.booking_id ? (
                      <span className={styles.menuSlot}>
                        <MoreOptionsMenu
                          label={`More options for ${item.petName}`}
                          items={[
                            {
                              label: 'View booking details',
                              onSelect: () =>
                                navigate(
                                  `/staff/bookings/${item.session.booking_id}`
                                ),
                            },
                          ]}
                        />
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.metaLine}>
                    Checked in:{' '}
                    {item.session.check_in_at
                      ? formatDateTime(item.session.check_in_at)
                      : 'Unknown'}
                  </span>
                  {isCheckoutable ? (
                    <div className={styles.cardControls}>
                      <button
                        type="button"
                        className={styles.checkOutButton}
                        onClick={() => onSelect(item.session)}
                      >
                        Check out
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
