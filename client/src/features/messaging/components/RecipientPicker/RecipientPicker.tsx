import { useEffect, useMemo, useRef, useState } from 'react';
import { searchDirectory } from '../../api/messaging.api';
import type { DirectoryEntry } from '../../messaging.types';
import type { StaffRole } from '../../../staff/staff.types';
import styles from './RecipientPicker.module.css';

interface RecipientPickerProps {
  accessToken: string;
  selected: DirectoryEntry[];
  onChange: (selected: DirectoryEntry[]) => void;
}

type KindFilter = 'all' | 'staff' | 'customer';
type SortKey = 'relevance' | 'name-asc' | 'name-desc';

/**
 * Debounced search-and-select for Mail's "anyone to anyone" recipient
 * targeting - hits GET /messages/directory (any authenticated user, staff
 * or customer), multi-select chips of the chosen DirectoryEntry rows.
 * Filter (customer vs. staff, and staff role) and sort apply client-side
 * to the current result page - the search itself stays server-side.
 */
export function RecipientPicker({
  accessToken,
  selected,
  onChange,
}: RecipientPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('relevance');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < 2) {
      return;
    }

    // Every setState call (including "start searching") happens inside the
    // setTimeout callback, not as a direct statement in the effect body -
    // also means "Searching..." only appears once the debounced request is
    // actually about to fire, not during the debounce delay itself.
    debounceRef.current = setTimeout(() => {
      setIsSearching(true);
      void searchDirectory(query, accessToken).then((result) => {
        setIsSearching(false);
        setResults(result.data ?? []);
      });
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, accessToken]);

  // A shrunk-below-2-chars query doesn't re-fetch (the effect above just
  // returns early), so `results` can still hold a stale page - derived here
  // (memoized so its reference is stable) rather than cleared via setState
  // in the effect, since that's the one thing an effect body shouldn't do
  // synchronously.
  const effectiveResults = useMemo(
    () => (query.trim().length < 2 ? [] : results),
    [query, results]
  );

  const availableRoles = useMemo(
    () =>
      [
        ...new Set(
          effectiveResults
            .filter((entry) => entry.kind === 'staff')
            .map((entry) => entry.role)
        ),
      ]
        .filter((role): role is StaffRole => Boolean(role))
        .sort(),
    [effectiveResults]
  );

  const visibleResults = useMemo(() => {
    let next = effectiveResults;

    if (kindFilter !== 'all') {
      next = next.filter((entry) => entry.kind === kindFilter);
    }

    if (roleFilter !== 'all') {
      next = next.filter((entry) => entry.role === roleFilter);
    }

    const sorted = [...next];
    if (sortKey === 'name-asc') {
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (sortKey === 'name-desc') {
      sorted.sort((a, b) => b.displayName.localeCompare(a.displayName));
    }

    return sorted;
  }, [effectiveResults, kindFilter, roleFilter, sortKey]);

  const selectedIds = new Set(selected.map((entry) => entry.id));
  const showControls = query.trim().length >= 2;

  function addRecipient(entry: DirectoryEntry) {
    if (!selectedIds.has(entry.id)) {
      onChange([...selected, entry]);
    }
    setQuery('');
    setResults([]);
  }

  function removeRecipient(id: string) {
    onChange(selected.filter((entry) => entry.id !== id));
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.chips}>
        {selected.map((entry) => (
          <span key={entry.id} className={styles.chip}>
            {entry.displayName}
            {entry.kind === 'staff' && entry.role ? ` (${entry.role})` : ''}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Remove ${entry.displayName}`}
              onClick={() => removeRecipient(entry.id)}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className={styles.input}
        placeholder="Search staff or customers by name..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {showControls ? (
        <div className={styles.controls}>
          <select
            className={styles.filterSelect}
            value={kindFilter}
            onChange={(event) => {
              setKindFilter(event.target.value as KindFilter);
              setRoleFilter('all');
            }}
          >
            <option value="all">Staff & customers</option>
            <option value="staff">Staff only</option>
            <option value="customer">Customers only</option>
          </select>
          {kindFilter !== 'customer' && availableRoles.length > 0 ? (
            <select
              className={styles.filterSelect}
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">All roles</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className={styles.filterSelect}
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            <option value="relevance">Best match</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </div>
      ) : null}

      {isSearching ? <p className={styles.hint}>Searching...</p> : null}
      {!isSearching && showControls && visibleResults.length === 0 ? (
        <p className={styles.hint}>No matches.</p>
      ) : null}
      {!isSearching && visibleResults.length > 0 ? (
        <ul className={styles.results}>
          {visibleResults.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={styles.resultItem}
                onClick={() => addRecipient(entry)}
              >
                {entry.displayName}
                {entry.kind === 'staff' && entry.role
                  ? ` (${entry.role})`
                  : ' (Customer)'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
