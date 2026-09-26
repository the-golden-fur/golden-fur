import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { CreditTransaction } from '../../credits.types';

const TYPE_OPTIONS = [
  { value: 'issuance', label: 'Issued' },
  { value: 'redemption', label: 'Redeemed' },
  { value: 'expiry', label: 'Expired' },
];

export const CREDIT_HISTORY_FILTER_FIELDS: FilterField[] = [
  {
    id: 'type',
    label: 'Type',
    type: 'select',
    defaultValue: TYPE_OPTIONS[0].value,
    options: TYPE_OPTIONS,
    formatValue: (value) =>
      TYPE_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
];

export type CreditHistorySortKey =
  | 'date-desc'
  | 'date-asc'
  | 'amount-desc'
  | 'amount-asc';

export const CREDIT_HISTORY_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'date',
    label: 'Date',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
  {
    id: 'amount',
    label: 'Amount',
    directions: [
      { value: 'desc', label: 'High to low' },
      { value: 'asc', label: 'Low to high' },
    ],
  },
];

export const CREDIT_HISTORY_COMPARATORS: Record<
  CreditHistorySortKey,
  (a: CreditTransaction, b: CreditTransaction) => number
> = {
  'date-desc': (a, b) => b.created_at.localeCompare(a.created_at),
  'date-asc': (a, b) => a.created_at.localeCompare(b.created_at),
  'amount-desc': (a, b) => b.amount - a.amount,
  'amount-asc': (a, b) => a.amount - b.amount,
};

export function deriveCreditHistorySortKey(
  sortTile: SortTile | null
): CreditHistorySortKey {
  if (!sortTile) return 'date-desc';
  if (sortTile.fieldId === 'amount') {
    return sortTile.direction === 'asc' ? 'amount-asc' : 'amount-desc';
  }
  return sortTile.direction === 'asc' ? 'date-asc' : 'date-desc';
}

/** The one filter tile here (Type) is entirely client-side - the history
 * endpoint has no query params today. */
export function applyCreditHistoryFilters(
  history: CreditTransaction[],
  tiles: FilterTile[]
): CreditTransaction[] {
  let result = history;

  for (const tile of tiles) {
    if (tile.fieldId === 'type' && typeof tile.value === 'string') {
      result = result.filter((txn) => txn.transaction_type === tile.value);
    }
  }

  return result;
}
