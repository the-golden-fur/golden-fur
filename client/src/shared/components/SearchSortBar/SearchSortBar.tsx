import styles from './SearchSortBar.module.css';

export interface SortOption<SortKey extends string> {
  value: SortKey;
  label: string;
}

interface SearchSortBarProps<SortKey extends string> {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  sortValue: SortKey;
  onSortChange: (value: SortKey) => void;
  sortOptions: SortOption<SortKey>[];
}

/**
 * Search input + sort select, paired with useSearchAndSort. Renders as two
 * sibling elements (no wrapper) so it drops directly into QueueFilterBar's
 * `children` slot alongside its own filters, matching how
 * ReceptionistBookingsQueuePage/HotelBookingPicker already lay these out.
 */
export function SearchSortBar<SortKey extends string>({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortValue,
  onSortChange,
  sortOptions,
}: SearchSortBarProps<SortKey>) {
  return (
    <>
      <input
        className={styles.searchInput}
        type="search"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <select
        className={styles.sortSelect}
        value={sortValue}
        onChange={(event) => onSortChange(event.target.value as SortKey)}
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
