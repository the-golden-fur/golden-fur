import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import type { Discount } from '../../discounts.types';

const SCOPE_TYPE_OPTIONS = [
  { value: 'service', label: 'Service' },
  { value: 'package', label: 'Package' },
  { value: 'category', label: 'Category' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function availableBranchIds(discount: Discount): string[] {
  return (discount.discount_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/** `branchOptions` comes from `listBranches` - rebuilt whenever that list
 * changes, same as the create/edit form's own branch multi-select. */
export function buildDiscountFilterFields(
  branchOptions: BranchSummary[]
): FilterField[] {
  const branchField: FilterField = {
    id: 'branch',
    label: 'Branch',
    type: 'select',
    defaultValue: branchOptions[0]?.id ?? '',
    options: branchOptions.map((branch) => ({
      value: branch.id,
      label: branch.name,
    })),
    formatValue: (value) =>
      branchOptions.find((branch) => branch.id === value)?.name ?? 'Any',
  };

  const scopeTypeField: FilterField = {
    id: 'scopeType',
    label: 'Scope',
    type: 'select',
    defaultValue: 'service',
    options: SCOPE_TYPE_OPTIONS,
    formatValue: (value) =>
      SCOPE_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  };

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  };

  return [branchField, scopeTypeField, statusField];
}

export type DiscountSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'value-desc'
  | 'value-asc';

export const DISCOUNT_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'value',
    label: 'Value',
    directions: [
      { value: 'desc', label: 'High to low' },
      { value: 'asc', label: 'Low to high' },
    ],
  },
];

export const DISCOUNT_COMPARATORS: Record<
  DiscountSortKey,
  (a: Discount, b: Discount) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'value-desc': (a, b) => b.value - a.value,
  'value-asc': (a, b) => a.value - b.value,
};

export function deriveDiscountSortKey(
  sortTile: SortTile | null
): DiscountSortKey {
  if (!sortTile) return 'name-asc';
  if (sortTile.fieldId === 'value') {
    return sortTile.direction === 'asc' ? 'value-asc' : 'value-desc';
  }
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesDiscountQuery(
  discount: Discount,
  query: string
): boolean {
  return discount.name.toLowerCase().includes(query);
}

/** Every filter tile here is client-side only, same as the page's previous
 * `filteredDiscounts` useMemo - reproduced as a pure function so it can be
 * unit tested independently of the page. */
export function applyDiscountFilters(
  discounts: Discount[],
  tiles: FilterTile[]
): Discount[] {
  let result = discounts;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'branch' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      const branchId = tile.value;
      result = result.filter((discount) =>
        availableBranchIds(discount).includes(branchId)
      );
    }

    if (
      tile.fieldId === 'scopeType' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((discount) => discount.scope_type === tile.value);
    }

    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((discount) => discount.is_active === wantActive);
    }
  }

  return result;
}

export const DISCOUNT_TYPE_COLUMNS = ['Government-Mandated', 'Custom'];

/** Default group-by, replacing the old fixed "Government-Mandated" /
 * "Custom Discounts" two-section layout with a Board view grouping (per the
 * Ideas backlog: "combined into one list... group by"). */
export const DISCOUNT_GROUP_BY_AXES: GroupByAxis<Discount>[] = [
  {
    id: 'type',
    label: 'Type',
    columns: DISCOUNT_TYPE_COLUMNS,
    columnFor: (discount) =>
      discount.is_mandated ? 'Government-Mandated' : 'Custom',
  },
];
