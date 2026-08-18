import { useMemo, useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import styles from './BranchAvailabilityModal.module.css';

export interface BranchAvailabilityRow {
  branchId: string;
  branchName: string;
  isAvailable: boolean;
}

interface BranchAvailabilityModalProps {
  isOpen: boolean;
  itemName: string;
  rows: BranchAvailabilityRow[];
  onToggle: (branchId: string, isAvailable: boolean) => void;
  onClose: () => void;
}

type AvailabilitySortKey = 'name-asc' | 'name-desc';
type AvailabilityStatusFilter = 'all' | 'available' | 'unavailable';

const SORT_OPTIONS: SortOption<AvailabilitySortKey>[] = [
  { value: 'name-asc', label: 'Branch (A-Z)' },
  { value: 'name-desc', label: 'Branch (Z-A)' },
];

/**
 * Row-level "Branch Availability" action (Custom change: services/packages/
 * service types actions menu revision) - the enable/disable-per-branch
 * toggles that used to sit inline on every list row now live behind this
 * modal instead, one per branch. Shared by Services and Service Types (a
 * real list of branches) and Packages (a Package row only ever has one
 * branch - MA22 - so its caller passes a single-row list; the modal itself
 * doesn't know or care how many branches a given item has).
 *
 * Search/filter/sort is mostly future-proofing for a longer branch list -
 * with today's two real branches it still gives a consistent affordance
 * across all three callers, per the request.
 */
export function BranchAvailabilityModal({
  isOpen,
  itemName,
  rows,
  onToggle,
  onClose,
}: BranchAvailabilityModalProps) {
  const [statusFilter, setStatusFilter] =
    useState<AvailabilityStatusFilter>('all');

  const comparators = useMemo(
    () => ({
      'name-asc': (a: BranchAvailabilityRow, b: BranchAvailabilityRow) =>
        a.branchName.localeCompare(b.branchName),
      'name-desc': (a: BranchAvailabilityRow, b: BranchAvailabilityRow) =>
        b.branchName.localeCompare(a.branchName),
    }),
    []
  );

  const { search, setSearch, sortKey, setSortKey, result } = useSearchAndSort<
    BranchAvailabilityRow,
    AvailabilitySortKey
  >({
    items: rows,
    matchesQuery: (row, query) => row.branchName.toLowerCase().includes(query),
    comparators,
    initialSortKey: 'name-asc',
  });

  const filteredRows = result.filter((row) => {
    if (statusFilter === 'available') return row.isAvailable;
    if (statusFilter === 'unavailable') return !row.isAvailable;
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      title={`Branch Availability - ${itemName}`}
      onClose={onClose}
    >
      <div className={styles.toolbar}>
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search branches..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Status</span>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as AvailabilityStatusFilter)
            }
          >
            <option value="all">All</option>
            <option value="available">Available only</option>
            <option value="unavailable">Unavailable only</option>
          </select>
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <p className={styles.emptyState}>No branches match the filters.</p>
      ) : (
        <ul className={styles.list}>
          {filteredRows.map((row) => (
            <li key={row.branchId} className={styles.row}>
              <ToggleSwitch
                label={row.branchName}
                checked={row.isAvailable}
                onChange={(isAvailable) => onToggle(row.branchId, isAvailable)}
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
