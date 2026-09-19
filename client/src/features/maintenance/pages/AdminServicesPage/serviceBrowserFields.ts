import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  SERVICE_CATEGORIES,
  type BranchSummary,
  type Service,
} from '../../maintenance.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function availableBranchIds(service: Service): string[] {
  return (service.service_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

export function buildServiceFilterFields(
  branchOptions: BranchSummary[]
): FilterField[] {
  const categoryField: FilterField = {
    id: 'category',
    label: 'Category',
    type: 'select',
    defaultValue: SERVICE_CATEGORIES[0],
    options: SERVICE_CATEGORIES.map((category) => ({
      value: category,
      label: category,
    })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  };

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
    // The page has always defaulted to Active-only visible.
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  };

  return [categoryField, branchField, statusField];
}

export type ServiceSortKey = 'name-asc' | 'name-desc';

export const SERVICE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const SERVICE_COMPARATORS: Record<
  ServiceSortKey,
  (a: Service, b: Service) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveServiceSortKey(sortTile: SortTile | null): ServiceSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesServiceQuery(service: Service, query: string): boolean {
  return service.name.toLowerCase().includes(query);
}

/** Every filter tile here is client-side only, reproducing the page's old
 * `filteredServices` useMemo as a pure, independently-testable function. */
export function applyServiceFilters(
  services: Service[],
  tiles: FilterTile[]
): Service[] {
  let result = services;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'category' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((service) => service.category === tile.value);
    }

    if (
      tile.fieldId === 'branch' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      const branchId = tile.value;
      result = result.filter((service) =>
        availableBranchIds(service).includes(branchId)
      );
    }

    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((service) => service.is_active === wantActive);
    }
  }

  return result;
}

export const SERVICE_GROUP_BY_AXES: GroupByAxis<Service>[] = [
  {
    id: 'category',
    label: 'Category',
    columns: SERVICE_CATEGORIES,
    columnFor: (service) => service.category,
  },
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (service) => (service.is_active ? 'Active' : 'Inactive'),
  },
];
