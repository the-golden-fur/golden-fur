import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { CustomerProfile } from '../../../customers/customer.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const SIGN_IN_METHOD_LABELS: Record<
  CustomerProfile['primary_auth_provider'],
  string
> = {
  email: 'Email',
  google: 'Google',
  facebook: 'Facebook',
};

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

export const CUSTOMER_GROUP_BY_AXES: GroupByAxis<CustomerProfile>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (customer) => (customer.is_active ? 'Active' : 'Inactive'),
  },
  {
    id: 'signInMethod',
    label: 'Sign-in method',
    columns: ['Email', 'Google', 'Facebook'],
    columnFor: (customer) => SIGN_IN_METHOD_LABELS[customer.primary_auth_provider],
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
