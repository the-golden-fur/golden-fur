import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { BranchSummary, ServiceType } from '../../maintenance.types';

function availableBranchIds(serviceType: ServiceType): string[] {
  return (serviceType.service_type_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

export function buildServiceTypeFilterFields(
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

  return [branchField];
}

export type ServiceTypeSortKey = 'name-asc' | 'name-desc';

export const SERVICE_TYPE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const SERVICE_TYPE_COMPARATORS: Record<
  ServiceTypeSortKey,
  (a: ServiceType, b: ServiceType) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveServiceTypeSortKey(
  sortTile: SortTile | null
): ServiceTypeSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesServiceTypeQuery(
  serviceType: ServiceType,
  query: string
): boolean {
  return serviceType.name.toLowerCase().includes(query);
}

/** The Branch filter tile is client-side only, reproducing the page's old
 * branch-availability filter as a pure function. */
export function applyServiceTypeFilters(
  serviceTypes: ServiceType[],
  tiles: FilterTile[]
): ServiceType[] {
  let result = serviceTypes;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'branch' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      const branchId = tile.value;
      result = result.filter((serviceType) =>
        availableBranchIds(serviceType).includes(branchId)
      );
    }
  }

  return result;
}

export const SERVICE_TYPE_GROUP_BY_AXES: GroupByAxis<ServiceType>[] = [
  {
    id: 'staffPicker',
    label: 'Staff picker',
    columns: ['Enabled', 'Disabled'],
    columnFor: (serviceType) =>
      serviceType.staff_picker_enabled ? 'Enabled' : 'Disabled',
  },
  {
    id: 'cagePicker',
    label: 'Cage picker',
    columns: ['Enabled', 'Disabled'],
    columnFor: (serviceType) =>
      serviceType.cage_picker_enabled ? 'Enabled' : 'Disabled',
  },
];
