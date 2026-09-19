import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { PetTypeRow } from '../../maintenance.types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const PET_TYPE_FILTER_FIELDS: FilterField[] = [
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

export type PetTypeSortKey = 'name-asc' | 'name-desc' | 'key-asc' | 'key-desc';

export const PET_TYPE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'key',
    label: 'Key',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const PET_TYPE_COMPARATORS: Record<
  PetTypeSortKey,
  (a: PetTypeRow, b: PetTypeRow) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'key-asc': (a, b) => a.key.localeCompare(b.key),
  'key-desc': (a, b) => b.key.localeCompare(a.key),
};

export function deriveSortKey(sortTile: SortTile | null): PetTypeSortKey {
  if (!sortTile) return 'name-asc';
  if (sortTile.fieldId === 'key') {
    return sortTile.direction === 'desc' ? 'key-desc' : 'key-asc';
  }
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesPetTypeQuery(petType: PetTypeRow, query: string): boolean {
  return (
    petType.name.toLowerCase().includes(query) ||
    petType.key.toLowerCase().includes(query)
  );
}

/** The one filter tile here (Status) is entirely client-side - `listPetTypes`
 * has no query params today. */
export function applyPetTypeFilters(
  petTypes: PetTypeRow[],
  tiles: FilterTile[]
): PetTypeRow[] {
  let result = petTypes;

  for (const tile of tiles) {
    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((petType) => petType.is_active === wantActive);
    }
  }

  return result;
}

export const PET_TYPE_GROUP_BY_AXES: GroupByAxis<PetTypeRow>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: ['Active', 'Inactive'],
    columnFor: (petType) => (petType.is_active ? 'Active' : 'Inactive'),
  },
];
