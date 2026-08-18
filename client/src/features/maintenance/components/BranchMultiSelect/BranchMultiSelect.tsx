import { useMemo } from 'react';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import type { BranchSummary } from '../../maintenance.types';
import styles from './BranchMultiSelect.module.css';

interface BranchMultiSelectProps {
  /** Accessible group name, e.g. "Available at". */
  label: string;
  branches: BranchSummary[];
  selectedBranchIds: string[];
  onChange: (selectedBranchIds: string[]) => void;
  disabled?: boolean;
}

type BranchSortKey = 'name-asc' | 'name-desc';

const SORT_OPTIONS: SortOption<BranchSortKey>[] = [
  { value: 'name-asc', label: 'Branch (A-Z)' },
  { value: 'name-desc', label: 'Branch (Z-A)' },
];

/**
 * Checkbox multiselect over the branch list - same shape as
 * ServiceMultiSelect (a list of selected ids plus onChange) but wrapped with
 * SearchSortBar/useSearchAndSort (search + sort only - with today's handful
 * of branches there's no third, meaningfully distinct "filter" axis beyond
 * search). Used by the Services, Service Types, and Packages create/edit
 * forms to pick which branches an item is available at.
 */
export function BranchMultiSelect({
  label,
  branches,
  selectedBranchIds,
  onChange,
  disabled = false,
}: BranchMultiSelectProps) {
  const comparators = useMemo(
    () => ({
      'name-asc': (a: BranchSummary, b: BranchSummary) =>
        a.name.localeCompare(b.name),
      'name-desc': (a: BranchSummary, b: BranchSummary) =>
        b.name.localeCompare(a.name),
    }),
    []
  );

  const { search, setSearch, sortKey, setSortKey, result } = useSearchAndSort<
    BranchSummary,
    BranchSortKey
  >({
    items: branches,
    matchesQuery: (branch, query) => branch.name.toLowerCase().includes(query),
    comparators,
    initialSortKey: 'name-asc',
  });

  const selected = new Set(selectedBranchIds);
  const visibleIds = new Set(result.map((branch) => branch.id));

  const handleToggle = (branchId: string) => {
    const next = new Set(selected);

    if (next.has(branchId)) {
      next.delete(branchId);
    } else {
      next.add(branchId);
    }

    // Same hidden-selection-survives-toggle guard as ServiceMultiSelect -
    // preserve display order among the currently visible (searched) rows,
    // then keep any selected branch the search box has merely hidden (not
    // deselected).
    const visible = result.map((b) => b.id).filter((bid) => next.has(bid));
    const hidden = selectedBranchIds.filter(
      (bid) => next.has(bid) && !visibleIds.has(bid)
    );
    onChange([...visible, ...hidden]);
  };

  return (
    <fieldset className={styles.multiSelect}>
      <legend className={styles.legend}>{label}</legend>

      <div className={styles.toolbar}>
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search branches..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </div>

      {result.length === 0 ? (
        <p className={styles.empty}>No branches match your search.</p>
      ) : (
        <ul className={styles.optionList}>
          {result.map((branch) => (
            <li key={branch.id} className={styles.optionItem}>
              <label className={styles.optionLabel}>
                <input
                  type="checkbox"
                  checked={selected.has(branch.id)}
                  disabled={disabled}
                  onChange={() => handleToggle(branch.id)}
                />
                <span>{branch.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
