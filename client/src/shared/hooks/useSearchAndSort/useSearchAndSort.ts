import { useMemo, useState } from 'react';

interface UseSearchAndSortOptions<T, SortKey extends string> {
  items: T[];
  /** Called only when the trimmed, lowercased search text is non-empty. */
  matchesQuery: (item: T, query: string) => boolean;
  comparators: Record<SortKey, (a: T, b: T) => number>;
  initialSortKey: SortKey;
}

interface UseSearchAndSortResult<T, SortKey extends string> {
  search: string;
  setSearch: (value: string) => void;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  result: T[];
}

/**
 * Client-side search + sort over an already-fetched list - the exact
 * `search`/`sortKey` state and filter-then-sort useMemo that
 * ReceptionistBookingsQueuePage and HotelBookingPicker each hand-rolled
 * identically (down to the same SortKey union and CSS classes). Pairs with
 * SearchSortBar for the input/select UI; matching/sorting stays
 * caller-defined since what "matches" or "soonest" means is domain-specific.
 */
export function useSearchAndSort<T, SortKey extends string>({
  items,
  matchesQuery,
  comparators,
  initialSortKey,
}: UseSearchAndSortOptions<T, SortKey>): UseSearchAndSortResult<T, SortKey> {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);

  const result = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? items.filter((item) => matchesQuery(item, query))
      : items;

    const comparator = comparators[sortKey];
    return comparator ? [...matches].sort(comparator) : matches;
  }, [items, matchesQuery, comparators, search, sortKey]);

  return { search, setSearch, sortKey, setSortKey, result };
}
