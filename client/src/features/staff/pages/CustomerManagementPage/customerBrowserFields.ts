import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { CustomerProfile } from '../../../customers/customer.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const CUSTOMER_FILTER_FIELDS: FilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
];

export type CustomerSortKey = 'name-asc' | 'name-desc';

export const CUSTOMER_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const CUSTOMER_COMPARATORS: Record<
  CustomerSortKey,
  (a: CustomerProfile, b: CustomerProfile) => number
> = {
  'name-asc': (a, b) => a.full_name.localeCompare(b.full_name),
  'name-desc': (a, b) => b.full_name.localeCompare(a.full_name),
};

export function deriveCustomerSortKey(
  sortTile: SortTile | null
): CustomerSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesCustomerQuery(
  customer: CustomerProfile,
  query: string
): boolean {
  return (
    customer.full_name.toLowerCase().includes(query) ||
    customer.account_email.toLowerCase().includes(query)
  );
}

/** The one filter tile here (Status) is entirely client-side - `listCustomers`
 * has no query params today. */
export function applyCustomerFilters(
  customers: CustomerProfile[],
  tiles: FilterTile[]
): CustomerProfile[] {
  let result = customers;

  for (const tile of tiles) {
    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((customer) => customer.is_active === wantActive);
    }
  }

  return result;
}
