import {
  dateRangePresetLabel,
  resolveDateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type {
  DateRangeValue,
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { PAYMENT_METHODS, type Transaction } from '../../billing.types';

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Due payment' },
  { value: 'Partially Paid', label: 'Partially Paid' },
  { value: 'Fully Paid', label: 'Fully Paid' },
];

function optionLabel(
  options: { value: string; label: string }[],
  value: unknown
): string {
  return options.find((option) => option.value === value)?.label ?? 'Any';
}

function formatDateRange(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Any date';
  const range = value as DateRangeValue;
  if (range.preset === 'custom') {
    if (!range.from && !range.to) return 'Any date';
    return `${range.from ?? '…'} → ${range.to ?? '…'}`;
  }
  return dateRangePresetLabel(range.preset);
}

export interface CustomerOption {
  id: string;
  full_name: string;
}

/** Every field here is applied client-side (`listMiscSales` has no query
 * params) - `customers` is the page's own already-loaded list, matching
 * `buildStaffFilterFields`'s async-select customer field in
 * transactionFilterFields.ts. */
export function buildMiscSaleFilterFields(
  customers: CustomerOption[]
): FilterField[] {
  const paymentMethodField: FilterField = {
    id: 'paymentMethod',
    label: 'Payment method',
    type: 'select',
    defaultValue: PAYMENT_METHODS[0],
    options: PAYMENT_METHODS.map((method) => ({
      value: method,
      label: method,
    })),
    formatValue: (value) =>
      typeof value === 'string' && value ? value : 'Any',
  };

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'Fully Paid',
    options: STATUS_OPTIONS,
    formatValue: (value) => optionLabel(STATUS_OPTIONS, value),
  };

  const dateField: FilterField = {
    id: 'date',
    label: 'Date',
    type: 'date-range',
    defaultValue: { preset: 'all', from: null, to: null },
    formatValue: formatDateRange,
  };

  const customerField: FilterField = {
    id: 'customer',
    label: 'Customer',
    type: 'async-select',
    defaultValue: '',
    options: customers.map((customer) => ({
      value: customer.id,
      label: customer.full_name,
    })),
    formatValue: (value) =>
      customers.find((customer) => customer.id === value)?.full_name ?? 'Any',
  };

  return [paymentMethodField, statusField, dateField, customerField];
}

export function applyMiscSaleFilters(
  items: Transaction[],
  tiles: FilterTile[]
): Transaction[] {
  let result = items;

  for (const tile of tiles) {
    const value = tile.value;

    if (
      tile.fieldId === 'paymentMethod' &&
      typeof value === 'string' &&
      value
    ) {
      result = result.filter((item) => item.payment_method === value);
    }

    if (tile.fieldId === 'status' && typeof value === 'string' && value) {
      result = result.filter((item) => item.payment_status === value);
    }

    if (tile.fieldId === 'customer' && typeof value === 'string' && value) {
      result = result.filter((item) => item.customer_id === value);
    }

    if (tile.fieldId === 'date' && value && typeof value === 'object') {
      const range = value as DateRangeValue;
      const bounds =
        range.preset === 'custom'
          ? { from: range.from, to: range.to }
          : resolveDateRangePreset(range.preset);

      if (bounds.from || bounds.to) {
        result = result.filter((item) => {
          const createdDate = item.created_at.slice(0, 10);
          if (bounds.from && createdDate < bounds.from) return false;
          if (bounds.to && createdDate > bounds.to) return false;
          return true;
        });
      }
    }
  }

  return result;
}

export function matchesMiscSaleQuery(
  item: Transaction,
  query: string
): boolean {
  return (
    (item.misc_sale_description ?? '').toLowerCase().includes(query) ||
    item.payment_method.toLowerCase().includes(query) ||
    item.payment_status.toLowerCase().includes(query)
  );
}

export type MiscSaleSortKey =
  | 'newest'
  | 'oldest'
  | 'amount-high'
  | 'amount-low';

export const MISC_SALE_SORT_FIELDS: SortFieldDescriptor[] = [
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

export const MISC_SALE_COMPARATORS: Record<
  MiscSaleSortKey,
  (a: Transaction, b: Transaction) => number
> = {
  newest: (a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  oldest: (a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  'amount-high': (a, b) => b.total_amount - a.total_amount,
  'amount-low': (a, b) => a.total_amount - b.total_amount,
};

export function deriveMiscSaleSortKey(
  sortTile: SortTile | null
): MiscSaleSortKey {
  if (!sortTile) return 'newest';
  if (sortTile.fieldId === 'amount') {
    return sortTile.direction === 'asc' ? 'amount-low' : 'amount-high';
  }
  return sortTile.direction === 'asc' ? 'oldest' : 'newest';
}

export function buildMiscSaleGroupByAxes(): GroupByAxis<Transaction>[] {
  return [
    {
      id: 'status',
      label: 'Status',
      columns: ['Pending', 'Partially Paid', 'Fully Paid'],
      columnFor: (item) => item.payment_status,
    },
    {
      id: 'paymentMethod',
      label: 'Payment method',
      columns: [...PAYMENT_METHODS],
      columnFor: (item) => item.payment_method,
    },
  ];
}
