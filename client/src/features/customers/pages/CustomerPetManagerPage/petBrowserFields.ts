import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { Pet, PetWeightClass } from '../../customer.types';

const WEIGHT_CLASSES: PetWeightClass[] = ['S', 'M', 'L', 'XL'];

const ASSESSMENT_OPTIONS = [
  { value: 'assessed', label: 'Assessed' },
  { value: 'not-assessed', label: 'Not yet assessed' },
];

function distinctPetTypes(pets: Pet[]): string[] {
  return Array.from(new Set(pets.map((pet) => pet.pet_type))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Pet type is free text (an admin-managed pet_types row's `key`, not a
 * fixed enum) - options come from whichever types are actually present in
 * the viewer's own pets, same approach as the catalog/breed adapters. */
export function buildPetFilterFields(pets: Pet[]): FilterField[] {
  const petTypes = distinctPetTypes(pets);

  const petTypeField: FilterField = {
    id: 'petType',
    label: 'Pet type',
    type: 'select',
    defaultValue: petTypes[0] ?? '',
    options: petTypes.map((petType) => ({ value: petType, label: petType })),
    formatValue: (value) =>
      typeof value === 'string' && value ? value : 'Any',
  };

  const weightClassField: FilterField = {
    id: 'weightClass',
    label: 'Weight class',
    type: 'select',
    defaultValue: WEIGHT_CLASSES[0],
    options: WEIGHT_CLASSES.map((weightClass) => ({
      value: weightClass,
      label: weightClass,
    })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  };

  const assessmentField: FilterField = {
    id: 'assessment',
    label: 'Assessment',
    type: 'select',
    defaultValue: 'assessed',
    options: ASSESSMENT_OPTIONS,
    formatValue: (value) =>
      ASSESSMENT_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  };

  return [petTypeField, weightClassField, assessmentField];
}

export type PetSortKey = 'name-asc' | 'name-desc';

export const PET_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const PET_COMPARATORS: Record<PetSortKey, (a: Pet, b: Pet) => number> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function derivePetSortKey(sortTile: SortTile | null): PetSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesPetQuery(pet: Pet, query: string): boolean {
  return (
    pet.name.toLowerCase().includes(query) ||
    pet.pet_type.toLowerCase().includes(query)
  );
}

/** Every filter tile here is client-side only - `listCustomerPets` has no
 * query params today. */
export function applyPetFilters(pets: Pet[], tiles: FilterTile[]): Pet[] {
  let result = pets;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'petType' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((pet) => pet.pet_type === tile.value);
    }

    if (
      tile.fieldId === 'weightClass' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((pet) => pet.weight_class === tile.value);
    }

    if (
      tile.fieldId === 'assessment' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      const wantAssessed = tile.value === 'assessed';
      result = result.filter((pet) =>
        wantAssessed ? pet.assessed_at !== null : pet.assessed_at === null
      );
    }
  }

  return result;
}

export function buildPetGroupByAxes(pets: Pet[]): GroupByAxis<Pet>[] {
  return [
    {
      id: 'petType',
      label: 'Pet type',
      columns: distinctPetTypes(pets),
      columnFor: (pet) => pet.pet_type,
    },
    {
      id: 'assessment',
      label: 'Assessment',
      columns: ['Assessed', 'Not yet assessed'],
      columnFor: (pet) =>
        pet.assessed_at !== null ? 'Assessed' : 'Not yet assessed',
    },
  ];
}
