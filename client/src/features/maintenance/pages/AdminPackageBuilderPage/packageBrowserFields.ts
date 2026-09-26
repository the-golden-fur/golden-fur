import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { BranchSummary, Package } from '../../maintenance.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function availableBranchIds(pkg: Package): string[] {
  return (pkg.package_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

export function buildPackageFilterFields(
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

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    // Inactive packages stay visible by default (not just Active) - the
    // Archive action only appears once a package is already Inactive.
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  };

  return [branchField, statusField];
}

export type PackageSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc';

export const PACKAGE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'price',
    label: 'Price',
    directions: [
      { value: 'asc', label: 'Low to high' },
      { value: 'desc', label: 'High to low' },
    ],
  },
];

export const PACKAGE_COMPARATORS: Record<
  PackageSortKey,
  (a: Package, b: Package) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'price-asc': (a, b) => a.bundled_price - b.bundled_price,
  'price-desc': (a, b) => b.bundled_price - a.bundled_price,
};

export function derivePackageSortKey(
  sortTile: SortTile | null
): PackageSortKey {
  if (!sortTile) return 'name-asc';
  if (sortTile.fieldId === 'price') {
    return sortTile.direction === 'asc' ? 'price-asc' : 'price-desc';
  }
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesPackageQuery(pkg: Package, query: string): boolean {
  return pkg.name.toLowerCase().includes(query);
}

/** Every filter tile here is client-side only, reproducing the page's old
 * `filteredPackages` useMemo as a pure, independently-testable function. */
export function applyPackageFilters(
  packages: Package[],
  tiles: FilterTile[]
): Package[] {
  let result = packages;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'branch' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      const branchId = tile.value;
      result = result.filter((pkg) =>
        availableBranchIds(pkg).includes(branchId)
      );
    }

    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((pkg) => pkg.is_active === wantActive);
    }
  }

  return result;
}

// Not offered as a group-by axis: a package's branch availability is
// multi-valued (available at several branches at once), and columnFor must
// return exactly one column per item - see the same reasoning on Cages'
// pet_types.
export const PACKAGE_GROUP_BY_AXES: GroupByAxis<Package>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (pkg) => (pkg.is_active ? 'Active' : 'Inactive'),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    columns: ['Varies by weight/coat', 'Flat price'],
    columnFor: (pkg) =>
      pkg.use_pricing_matrix ? 'Varies by weight/coat' : 'Flat price',
  },
];
