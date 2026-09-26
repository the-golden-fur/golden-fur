import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { Branch } from '../../maintenance.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const BRANCH_TYPE_OPTIONS = [
  { value: 'vet', label: 'Veterinary branch' },
  { value: 'grooming', label: 'Grooming only' },
];

/** Same "no tile applied by default" convention as every other Notion-style
 * browser page in this app (AdminCagesPage, AdminPetTypesPage,
 * AdminSpinWheelConfigPage's reward pool) - inactive branches are shown by
 * default, distinguished only by a Status column/badge, not hidden until a
 * Status filter tile is explicitly added. */
export const BRANCH_FILTER_FIELDS: FilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
  {
    id: 'branchType',
    label: 'Branch type',
    type: 'select',
    defaultValue: 'vet',
    options: BRANCH_TYPE_OPTIONS,
    formatValue: (value) =>
      BRANCH_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  },
];

export type BranchSortKey = 'name-asc' | 'name-desc';

export const BRANCH_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Branch name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const BRANCH_COMPARATORS: Record<
  BranchSortKey,
  (a: Branch, b: Branch) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveBranchSortKey(sortTile: SortTile | null): BranchSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesBranchQuery(branch: Branch, query: string): boolean {
  return (
    branch.name.toLowerCase().includes(query) ||
    branch.address.toLowerCase().includes(query)
  );
}

/** Every filter tile here is client-side only, same as every other page
 * using this shared toolbar - listBranchesFull has no query params. */
export function applyBranchFilters(
  branches: Branch[],
  tiles: FilterTile[]
): Branch[] {
  let result = branches;

  for (const tile of tiles) {
    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((branch) => branch.is_active === wantActive);
    }

    if (tile.fieldId === 'branchType' && typeof tile.value === 'string') {
      const wantVet = tile.value === 'vet';
      result = result.filter((branch) => branch.is_vet_branch === wantVet);
    }
  }

  return result;
}

export const BRANCH_GROUP_BY_AXES: GroupByAxis<Branch>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (branch) => (branch.is_active ? 'Active' : 'Inactive'),
  },
  {
    id: 'branchType',
    label: 'Branch type',
    columns: ['Veterinary branch', 'Grooming only'],
    columnFor: (branch) =>
      branch.is_vet_branch ? 'Veterinary branch' : 'Grooming only',
  },
];
