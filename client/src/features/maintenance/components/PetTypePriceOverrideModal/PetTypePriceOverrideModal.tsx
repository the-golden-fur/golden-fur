import { useMemo, useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import type {
  BranchSummary,
  PetTypePriceOverride,
} from '../../maintenance.types';
import styles from './PetTypePriceOverrideModal.module.css';

/** Sentinel key for the system-wide default row (branch_id: null) - same
 * convention the page used before this was pulled out into its own modal. */
const SYSTEM_DEFAULT_KEY = '';

interface PriceOverrideRow {
  branchId: string | null;
  branchName: string;
  hasOverride: boolean;
}

type SortKey = 'branch-asc' | 'branch-desc';

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { value: 'branch-asc', label: 'Branch (A-Z)' },
  { value: 'branch-desc', label: 'Branch (Z-A)' },
];

interface PetTypePriceOverrideModalProps {
  isOpen: boolean;
  petTypeName: string;
  branches: BranchSummary[];
  overrides: PetTypePriceOverride[];
  onSave: (branchId: string | null, fixedPrice: number) => void;
  onClear: (branchId: string | null) => void;
  onClose: () => void;
  error?: string | null;
}

/**
 * Custom change: "Configure" row action on Pet Types. Replaces the old
 * always-visible "Fixed price overrides" page section (pick one branch, set
 * a price for every pet type) with the shape the request actually asked
 * for: pick one pet type's row, then set its price per branch. Modeled on
 * BranchAvailabilityModal (same search/sort toolbar, same one-row-per-branch
 * list) - "Clear override" moves behind a small "..." menu per row instead
 * of a plain always-visible button, matching that same "..." convention.
 */
export function PetTypePriceOverrideModal({
  isOpen,
  petTypeName,
  branches,
  overrides,
  onSave,
  onClear,
  onClose,
  error,
}: PetTypePriceOverrideModalProps) {
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  const rows = useMemo<PriceOverrideRow[]>(
    () => [
      {
        branchId: null,
        branchName: 'All branches (default)',
        hasOverride: overrides.some((row) => row.branch_id === null),
      },
      ...branches.map((branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        hasOverride: overrides.some((row) => row.branch_id === branch.id),
      })),
    ],
    [branches, overrides]
  );

  const comparators = useMemo(
    () => ({
      'branch-asc': (a: PriceOverrideRow, b: PriceOverrideRow) =>
        a.branchName.localeCompare(b.branchName),
      'branch-desc': (a: PriceOverrideRow, b: PriceOverrideRow) =>
        b.branchName.localeCompare(a.branchName),
    }),
    []
  );

  const { search, setSearch, sortKey, setSortKey, result } = useSearchAndSort<
    PriceOverrideRow,
    SortKey
  >({
    items: rows,
    matchesQuery: (row, query) => row.branchName.toLowerCase().includes(query),
    comparators,
    initialSortKey: 'branch-asc',
  });

  function priceFor(branchId: string | null): string {
    const inputKey = branchId ?? SYSTEM_DEFAULT_KEY;
    if (inputKey in priceInputs) return priceInputs[inputKey];
    const existing = overrides.find((row) => row.branch_id === branchId);
    return existing ? String(existing.fixed_price) : '';
  }

  function setPriceFor(branchId: string | null, value: string) {
    const inputKey = branchId ?? SYSTEM_DEFAULT_KEY;
    setPriceInputs((prev) => ({ ...prev, [inputKey]: value }));
  }

  function handleSave(branchId: string | null) {
    const raw = priceFor(branchId);
    const fixedPrice = Number(raw);

    if (raw.trim() === '' || Number.isNaN(fixedPrice) || fixedPrice < 0) {
      return;
    }

    onSave(branchId, fixedPrice);
    setPriceInputs((prev) => {
      const next = { ...prev };
      delete next[branchId ?? SYSTEM_DEFAULT_KEY];
      return next;
    });
  }

  return (
    <Modal
      isOpen={isOpen}
      title={`Set price override - ${petTypeName}`}
      onClose={onClose}
    >
      <p className={styles.copy}>
        When set, every service and package booked for that branch (or every
        branch, for the default row) is charged this one flat price instead - it
        replaces the normal price entirely. Leave the price blank for "no
        override, use normal pricing."
      </p>

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

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {result.length === 0 ? (
        <p className={styles.emptyState}>No branches match this search.</p>
      ) : (
        <ul className={styles.list}>
          {result.map((row) => (
            <li key={row.branchId ?? SYSTEM_DEFAULT_KEY} className={styles.row}>
              <span className={styles.branchName}>{row.branchName}</span>
              <input
                className={styles.priceInput}
                type="number"
                min="0"
                step="0.01"
                placeholder="No override"
                aria-label={`Price for ${row.branchName}`}
                value={priceFor(row.branchId)}
                onChange={(event) =>
                  setPriceFor(row.branchId, event.target.value)
                }
              />
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => handleSave(row.branchId)}
              >
                Save
              </button>
              {row.hasOverride ? (
                <MoreOptionsMenu
                  label={`Actions for ${row.branchName} price override`}
                  items={[
                    {
                      label: 'Clear override',
                      onSelect: () => onClear(row.branchId),
                    },
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
