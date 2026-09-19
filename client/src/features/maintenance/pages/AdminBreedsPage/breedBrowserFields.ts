import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { Breed, PetTypeRow } from '../../maintenance.types';

/** `petTypeOptions` comes from `listPetTypes` - rebuilt whenever that list
 * changes, same as AdminBreedsPage's add-breed dropdown already does. */
export function buildBreedFilterFields(
  petTypeOptions: PetTypeRow[]
): FilterField[] {
  const petTypeField: FilterField = {
    id: 'petType',
    label: 'Pet type',
    type: 'select',
    defaultValue: petTypeOptions[0]?.key ?? '',
    options: petTypeOptions.map((petType) => ({
      value: petType.key,
      label: petType.name,
    })),
    formatValue: (value) =>
      petTypeOptions.find((petType) => petType.key === value)?.name ?? 'Any',
  };

  return [petTypeField];
}

export type BreedSortKey = 'name-asc' | 'name-desc';

export const BREED_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const BREED_COMPARATORS: Record<
  BreedSortKey,
  (a: Breed, b: Breed) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveBreedSortKey(sortTile: SortTile | null): BreedSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesBreedQuery(breed: Breed, query: string): boolean {
  return breed.name.toLowerCase().includes(query);
}

/** The Pet type filter tile is client-side only - `listBreedsAdmin` has no
 * query params today. */
export function applyBreedFilters(
  breeds: Breed[],
  tiles: FilterTile[]
): Breed[] {
  let result = breeds;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'petType' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((breed) => breed.pet_type === tile.value);
    }
  }

  return result;
}

/** `petTypeOptions` drives the group-by columns too, so a newly-added pet
 * type gets its own board column immediately - same reasoning as the
 * combined-list request in the Ideas backlog ("the entire breed list to be
 * combined into one... group by"). */
export function buildBreedGroupByAxes(
  petTypeOptions: PetTypeRow[]
): GroupByAxis<Breed>[] {
  return [
    {
      id: 'petType',
      label: 'Pet type',
      columns: petTypeOptions.map((petType) => petType.key),
      columnFor: (breed) => breed.pet_type,
    },
  ];
}
