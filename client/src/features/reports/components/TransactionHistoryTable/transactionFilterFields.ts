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
import type { TransactionHistoryFilters } from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';

export const SERVICE_CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Assessment',
];

/** DB `payment_status` value ↔ the label a cashier reads. */
const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Due payment' },
  { value: 'Partially Paid', label: 'Partially Paid' },
  { value: 'Fully Paid', label: 'Fully Paid' },
];

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'booking_payment', label: 'Booking payment' },
  { value: 'miscellaneous_sale', label: 'Miscellaneous sale' },
];

const PAYMENT_CHOICE_OPTIONS = [
  { value: 'full', label: 'Full payment' },
  { value: 'downpayment', label: 'Down payment' },
  { value: 'balance', label: 'Balance payment' },
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

const DATE_FIELD: FilterField = {
  id: 'date',
  label: 'Date',
  type: 'date-range',
  // Starts unrestricted - adding the tile must not silently hide older rows;
  // the user picks a range (or a preset) in the tile's popover.
  defaultValue: { preset: 'all', from: null, to: null },
  formatValue: formatDateRange,
};

const SERVICE_FIELD: FilterField = {
  id: 'service',
  label: 'Service',
  type: 'select',
  defaultValue: SERVICE_CATEGORIES[0],
  options: SERVICE_CATEGORIES.map((category) => ({
    value: category,
    label: category,
  })),
  formatValue: (value) => String(value ?? 'Any'),
};

const TRANSACTION_TYPE_FIELD: FilterField = {
  id: 'txnType',
  label: 'Transaction type',
  type: 'select',
  defaultValue: TRANSACTION_TYPE_OPTIONS[0].value,
  options: TRANSACTION_TYPE_OPTIONS,
  formatValue: (value) => optionLabel(TRANSACTION_TYPE_OPTIONS, value),
};

const PAYMENT_FIELD: FilterField = {
  id: 'payment',
  label: 'Payment',
  type: 'select',
  defaultValue: PAYMENT_CHOICE_OPTIONS[0].value,
  options: PAYMENT_CHOICE_OPTIONS,
  formatValue: (value) => optionLabel(PAYMENT_CHOICE_OPTIONS, value),
};

const STATUS_FIELD: FilterField = {
  id: 'status',
  label: 'Status',
  type: 'select',
  defaultValue: 'Pending',
  options: STATUS_OPTIONS,
  formatValue: (value) => optionLabel(STATUS_OPTIONS, value),
};

export interface CustomerOption {
  id: string;
  full_name: string;
}
export interface PetOption {
  id: string;
  name: string;
}

/** Staff page: full field set. `customers`/`pets` come from the page's own
 * `listCustomers` / `listCustomerPets` state; Pet is only offered once a
 * Customer filter exists. */
export function buildStaffFilterFields(opts: {
  customers: CustomerOption[];
  pets: PetOption[];
  hasCustomerFilter: boolean;
}): FilterField[] {
  const customerField: FilterField = {
    id: 'customer',
    label: 'Customer',
    type: 'async-select',
    defaultValue: '',
    options: opts.customers.map((customer) => ({
      value: customer.id,
      label: customer.full_name,
    })),
    formatValue: (value) =>
      opts.customers.find((customer) => customer.id === value)?.full_name ??
      'Any',
  };

  const petField: FilterField = {
    id: 'pet',
    label: 'Pet',
    type: 'async-select',
    disabled: !opts.hasCustomerFilter,
    defaultValue: '',
    options: opts.pets.map((pet) => ({ value: pet.id, label: pet.name })),
    formatValue: (value) =>
      opts.pets.find((pet) => pet.id === value)?.name ?? 'Any',
  };

  return [
    customerField,
    petField,
    DATE_FIELD,
    SERVICE_FIELD,
    TRANSACTION_TYPE_FIELD,
    PAYMENT_FIELD,
    STATUS_FIELD,
  ];
}

/** Customer portal: no customer/pet/transaction-type (always the caller's own
 * bookings). */
export const CUSTOMER_FILTER_FIELDS: FilterField[] = [
  DATE_FIELD,
  SERVICE_FIELD,
  PAYMENT_FIELD,
  STATUS_FIELD,
];

export const STAFF_SORT_FIELDS: SortFieldDescriptor[] = [
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
  {
    id: 'customer',
    label: 'Customer',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const CUSTOMER_SORT_FIELDS: SortFieldDescriptor[] =
  STAFF_SORT_FIELDS.filter((field) => field.id !== 'customer');

export type SortKey =
  | 'newest'
  | 'oldest'
  | 'amount-high'
  | 'amount-low'
  | 'customer-az'
  | 'customer-za';

export const COMPARATORS: Record<
  SortKey,
  (a: TransactionRecord, b: TransactionRecord) => number
> = {
  newest: (a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  oldest: (a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  'amount-high': (a, b) => b.total_amount - a.total_amount,
  'amount-low': (a, b) => a.total_amount - b.total_amount,
  'customer-az': (a, b) =>
    (a.customer_name ?? '').localeCompare(b.customer_name ?? ''),
  'customer-za': (a, b) =>
    (b.customer_name ?? '').localeCompare(a.customer_name ?? ''),
};

/** Map the server-backed filter tiles to `getTransactionHistory` query params.
 * A `status` tile is client-side only and is read by {@link deriveStatusFilter}
 * instead. */
export function deriveServerParams(
  tiles: FilterTile[]
): TransactionHistoryFilters {
  const params: TransactionHistoryFilters = {};

  for (const tile of tiles) {
    const value = tile.value;

    if (tile.fieldId === 'customer' && typeof value === 'string' && value) {
      params.customerId = value;
    }
    if (tile.fieldId === 'pet' && typeof value === 'string' && value) {
      params.petId = value;
    }
    if (tile.fieldId === 'service' && typeof value === 'string' && value) {
      params.serviceCategory = value;
    }
    if (tile.fieldId === 'txnType' && typeof value === 'string' && value) {
      params.transactionType = value;
    }
    if (tile.fieldId === 'payment' && typeof value === 'string' && value) {
      params.paymentChoice = value;
    }
    if (tile.fieldId === 'date' && value && typeof value === 'object') {
      const range = value as DateRangeValue;
      const bounds =
        range.preset === 'custom'
          ? { from: range.from, to: range.to }
          : resolveDateRangePreset(range.preset);
      if (bounds.from) params.dateFrom = bounds.from;
      if (bounds.to) params.dateTo = bounds.to;
    }
  }

  return params;
}

/** The DB `payment_status` a `status` tile narrows to, or null for no tile. */
export function deriveStatusFilter(tiles: FilterTile[]): string | null {
  const tile = tiles.find((entry) => entry.fieldId === 'status');
  return tile && typeof tile.value === 'string' ? tile.value : null;
}

export function deriveSortKey(sortTile: SortTile | null): SortKey {
  if (!sortTile) return 'newest';
  const { fieldId, direction } = sortTile;
  if (fieldId === 'amount') {
    return direction === 'asc' ? 'amount-low' : 'amount-high';
  }
  if (fieldId === 'customer') {
    return direction === 'desc' ? 'customer-za' : 'customer-az';
  }
  return direction === 'asc' ? 'oldest' : 'newest';
}
