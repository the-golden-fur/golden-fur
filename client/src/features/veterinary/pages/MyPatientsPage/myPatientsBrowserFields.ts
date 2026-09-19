import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { PetTypeRow } from '../../../customers/customer.types';

export interface PatientRow {
  petId: string;
  lastVisitAt: string;
  petName: string;
  ownerName: string;
  petType: string | null;
}

export function buildPatientFilterFields(
  petTypeOptions: PetTypeRow[]
): FilterField[] {
  return [
    {
      id: 'petType',
      label: 'Pet Type',
      type: 'select',
      defaultValue: petTypeOptions[0]?.key ?? '',
      options: petTypeOptions.map((type) => ({
        value: type.key,
        label: type.name,
      })),
      formatValue: (value) =>
        petTypeOptions.find((type) => type.key === value)?.name ?? 'Any',
    },
  ];
}

export type PatientSortKey = 'recent' | 'pet-name';

export const PATIENT_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'recent',
    label: 'Last visit',
    directions: [{ value: 'desc', label: 'Most recent first' }],
  },
  {
    id: 'pet-name',
    label: 'Pet name',
    directions: [{ value: 'asc', label: 'A to Z' }],
  },
];

export const PATIENT_COMPARATORS: Record<
  PatientSortKey,
  (a: PatientRow, b: PatientRow) => number
> = {
  recent: (a, b) =>
    new Date(b.lastVisitAt).getTime() - new Date(a.lastVisitAt).getTime(),
  'pet-name': (a, b) => a.petName.localeCompare(b.petName),
};

export function derivePatientSortKey(
  sortTile: SortTile | null
): PatientSortKey {
  if (!sortTile) return 'recent';
  return sortTile.fieldId === 'pet-name' ? 'pet-name' : 'recent';
}

export function matchesPatientQuery(row: PatientRow, query: string): boolean {
  return (
    row.petName.toLowerCase().includes(query) ||
    row.ownerName.toLowerCase().includes(query)
  );
}

/** The one filter tile here (Pet Type) is entirely client-side - this
 * roster has no query params today. */
export function applyPatientFilters(
  rows: PatientRow[],
  tiles: FilterTile[]
): PatientRow[] {
  let result = rows;

  for (const tile of tiles) {
    if (tile.fieldId === 'petType' && typeof tile.value === 'string') {
      result = result.filter((row) => row.petType === tile.value);
    }
  }

  return result;
}
