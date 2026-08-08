import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getPet } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { listDaycareSessions } from '../../api/daycare.api';
import type { DaycareSession } from '../../daycare.types';
import styles from './DaycareSessionPicker.module.css';

type SortKey = 'check-in-earliest' | 'pet-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'check-in-earliest', label: 'Sort: Checked in (earliest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
];

interface EnrichedSession {
  session: DaycareSession;
  petName: string;
}

interface DaycareSessionPickerProps {
  accessToken: string;
  onSelect: (session: DaycareSession) => void;
}

/**
 * Daycare Checkout's picker - same card-list pattern as HotelStayPicker, but
 * built directly on the shared useSearchAndSort hook from the start (no
 * "list active sessions" endpoint existed before this - GET /daycare/
 * sessions is new alongside this component).
 */
export function DaycareSessionPicker({
  accessToken,
  onSelect,
}: DaycareSessionPickerProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<DaycareSession[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listDaycareSessions(accessToken, 'Active').then((result) => {
      if (!isMounted) return;
      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load active Daycare sessions.');
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
  }, [accessToken]);

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
    result: visibleSessions,
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
  }, [search, sortKey, setSearch, setSortKey]);

  return (
    <div className={styles.wrapper}>
      <SearchSortBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by pet name..."
        sortValue={sortKey}
        onSortChange={setSortKey}
        sortOptions={SORT_OPTIONS}
      />

      <ActiveFilterChips chips={filterChips} />

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className={styles.copy}>Loading active Daycare sessions...</p>
      ) : visibleSessions.length === 0 ? (
        <p className={styles.copy}>
          {sessions.length === 0
            ? 'No pets are currently checked in to Daycare.'
            : 'No active sessions match your search.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {visibleSessions.map((item) => (
            <li key={item.session.id}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.petName}>{item.petName}</span>
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
                    ? new Date(item.session.check_in_at).toLocaleString()
                    : 'Unknown'}
                </span>
                <div className={styles.cardControls}>
                  <button
                    type="button"
                    className={styles.checkOutButton}
                    onClick={() => onSelect(item.session)}
                  >
                    Check out
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
