import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { CreditTransaction } from '../../credits.types';
import {
  applyCreditHistoryFilters,
  CREDIT_HISTORY_COMPARATORS,
  CREDIT_HISTORY_FILTER_FIELDS,
  CREDIT_HISTORY_SORT_FIELDS,
  deriveCreditHistorySortKey,
} from './creditHistoryFields';
import styles from './CreditHistoryTable.module.css';

function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₱${Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    // Pinned to the business timezone so the shown day matches the expiry
    // day math in credits/utils/expiry.ts.
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const TYPE_LABELS: Record<CreditTransaction['transaction_type'], string> = {
  issuance: 'Issued',
  redemption: 'Redeemed',
  expiry: 'Expired',
};

interface CreditHistoryTableProps {
  history: CreditTransaction[];
}

const COLUMNS: DataTableColumn<CreditTransaction>[] = [
  { id: 'date', header: 'Date', render: (txn) => formatDate(txn.created_at) },
  {
    id: 'type',
    header: 'Type',
    render: (txn) => TYPE_LABELS[txn.transaction_type],
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    render: (txn) => (
      <span className={txn.amount >= 0 ? styles.positive : styles.negative}>
        {formatCurrency(txn.amount)}
      </span>
    ),
  },
  {
    id: 'expires',
    header: 'Expires',
    render: (txn) => formatDate(txn.expires_at),
  },
];

/** Issue #95: issuance/redemption/expiry history for one (customer, branch)
 * pair - amount is signed at the source (positive issuance, negative
 * redemption/expiry), so no extra sign logic is needed beyond styling.
 * Notion-style remaster (session 110): a customer can accumulate an
 * unbounded number of these rows over time, so this is the genuine
 * "browse many records" piece of the credit-lookup flow (the surrounding
 * CreditManagementPage's own per-branch balance list is at most a handful
 * of cards and wasn't given the same treatment). */
export function CreditHistoryTable({ history }: CreditHistoryTableProps) {
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);

  const visibleHistory = useMemo(() => {
    const filtered = applyCreditHistoryFilters(history, filterTiles);

    // No sort tile means "keep fetch order" rather than imposing a default.
    if (!sortTile) return filtered;
    return [...filtered].sort(
      CREDIT_HISTORY_COMPARATORS[deriveCreditHistorySortKey(sortTile)]
    );
  }, [history, filterTiles, sortTile]);

  function handleAddFilter(fieldId: string) {
    const field = CREDIT_HISTORY_FILTER_FIELDS.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  if (history.length === 0) {
    return (
      <p className={styles.empty}>No credit history for this branch yet.</p>
    );
  }

  return (
    <div className={styles.wrapper}>
      <FilterSortBar
        filterFields={CREDIT_HISTORY_FILTER_FIELDS}
        filterTiles={filterTiles}
        onAddFilter={handleAddFilter}
        onChangeFilter={handleChangeFilter}
        onRemoveFilter={handleRemoveFilter}
        sortFields={CREDIT_HISTORY_SORT_FIELDS}
        sortTile={sortTile}
        onChangeSort={setSortTile}
      />
      <DataTable
        columns={COLUMNS}
        rows={visibleHistory}
        getRowKey={(txn) => txn.id}
        emptyMessage="No transactions match your filter."
      />
    </div>
  );
}
