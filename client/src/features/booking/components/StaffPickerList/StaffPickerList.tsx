import { useEffect, useMemo, useRef, useState } from 'react';
import { getStaffPickerOptions } from '../../api/booking.api';
import type {
  ServiceCategory,
  StaffPickerOption,
  StaffPreferenceInput,
} from '../../booking.types';
import styles from './StaffPickerList.module.css';

interface StaffPickerListProps {
  accessToken: string;
  branchId: string;
  /** Any category with staff_picker_enabled + at least one
   * eligible_staff_roles entry on its service_types row - no longer
   * restricted to Grooming/Veterinary now that this is admin-configurable
   * per service type (Admin Settings > Service Types). */
  serviceCategory: ServiceCategory;
  scheduledStart: string;
  scheduledEnd: string;
  selected: StaffPreferenceInput | null;
  onSelect: (preference: StaffPreferenceInput) => void;
  /**
   * Called once, the first time the endpoint resolves
   * `staff_picker_enabled: false` for this branch+service type - the caller
   * should treat this the same as "no staff preference" and move on (AC-1:
   * absent, not shown-then-hidden). GET /bookings/staff-picker is the only
   * customer-accessible signal for this - GET /bookings/policy is staff-only
   * (#52), so resolving it here (rather than a pre-check the caller does
   * before ever mounting this component) is what keeps this usable from
   * both the customer flow (#55/#59) and staff surfaces (#60).
   */
  onUnavailable?: () => void;
}

type SortKey = 'default' | 'name-asc' | 'name-desc';

function getInitials(displayName: string) {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function isSelected(
  option: StaffPickerOption,
  selected: StaffPreferenceInput | null
): boolean {
  if (!selected) return false;
  if (option.type === 'no_preference') return selected.type === 'no_preference';
  return selected.type === 'specific' && selected.staff_id === option.staff_id;
}

/**
 * Only mounted by the flow page when #52's toggle is enabled for the
 * selected branch+service type (AC-1) - the caller decides whether this
 * step exists in the stepper at all, so this component always assumes it
 * should render once mounted. Sourced directly from the #49 RPC response
 * shape via the Staff Picker endpoint - no second fetch to staff_profiles
 * (dev notes).
 *
 * Its own heading plus a search box (name) and sort control - client-side
 * only, over the already-fetched `options` - to stay easy to scan once the
 * roster gets larger than a couple of cards. "No preference" always stays
 * pinned first regardless of search/sort (AC-4), matching how the endpoint
 * itself already orders it. Also auto-selects "No preference" the moment a
 * fresh time window's options load if nothing is selected yet (still freely
 * overridable) - see below.
 */
export function StaffPickerList({
  accessToken,
  branchId,
  serviceCategory,
  scheduledStart,
  scheduledEnd,
  selected,
  onSelect,
  onUnavailable,
}: StaffPickerListProps) {
  const [options, setOptions] = useState<StaffPickerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');

  // Read via ref inside the fetch effect below so the callback's identity
  // (a fresh arrow function on every parent render, in practice) never
  // forces a re-fetch - only the actual query params should do that.
  const onUnavailableRef = useRef(onUnavailable);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    let isMounted = true;

    // isLoading/error reset from the fetch's own resolution below, not
    // synchronously here (React's set-state-in-effect guidance - a bare
    // top-of-effect setState would trigger an extra synchronous render
    // before the request even starts).
    void getStaffPickerOptions(accessToken, {
      branchId,
      serviceCategory,
      scheduledStart,
      scheduledEnd,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load available staff.');
        return;
      }

      setError(null);

      if (!result.data.staff_picker_enabled) {
        setIsUnavailable(true);
        onUnavailableRef.current?.();
        return;
      }

      // "No preference" is always first per #52 AC-4 - the endpoint already
      // guarantees this ordering, kept as-is rather than re-sorted here.
      setOptions(result.data.options);

      // Auto-picks "No preference" the first time this exact time window's
      // options load, so the step is already valid without forcing an extra
      // click - still freely overridable by clicking any specific staff card.
      // Only fires when nothing is selected yet, so it never clobbers a
      // choice already carried over (e.g. re-opening a reschedule panel).
      if (!selectedRef.current) {
        onSelectRef.current({ type: 'no_preference' });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId, serviceCategory, scheduledStart, scheduledEnd]);

  const filteredAndSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    const noPreference = options.filter(
      (option) => option.type === 'no_preference'
    );
    let specific = options.filter((option) => option.type === 'specific');

    if (query) {
      specific = specific.filter((option) =>
        option.display_name.toLowerCase().includes(query)
      );
    }

    if (sortKey !== 'default') {
      specific = [...specific].sort((a, b) =>
        sortKey === 'name-asc'
          ? a.display_name.localeCompare(b.display_name)
          : b.display_name.localeCompare(a.display_name)
      );
    }

    return [...noPreference, ...specific];
  }, [options, search, sortKey]);

  if (isUnavailable) {
    return null;
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading available staff...</p>;
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
      <span className={styles.heading}>Staff</span>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search staff by name..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={styles.sortSelect}
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          <option value="default">Sort: Default</option>
          <option value="name-asc">Sort: Name (A-Z)</option>
          <option value="name-desc">Sort: Name (Z-A)</option>
        </select>
      </div>

      {filteredAndSorted.length === 0 ? (
        <p className={styles.copy}>No staff match that search.</p>
      ) : (
        <div className={styles.grid}>
          {filteredAndSorted.map((option) => {
            const key =
              option.type === 'no_preference'
                ? 'no_preference'
                : option.staff_id;
            const active = isSelected(option, selected);

            return (
              <button
                key={key}
                type="button"
                className={`${styles.card} ${active ? styles.selected : ''}`}
                onClick={() =>
                  onSelect(
                    option.type === 'no_preference'
                      ? { type: 'no_preference' }
                      : { type: 'specific', staff_id: option.staff_id }
                  )
                }
              >
                {option.type === 'no_preference' ? (
                  <span className={styles.noPreferenceIcon} aria-hidden="true">
                    ?
                  </span>
                ) : option.profile_photo_url ? (
                  <img
                    className={styles.avatar}
                    src={option.profile_photo_url}
                    alt=""
                  />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden="true">
                    {getInitials(option.display_name)}
                  </span>
                )}
                <span className={styles.name}>
                  {option.type === 'no_preference'
                    ? 'No preference'
                    : option.display_name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
