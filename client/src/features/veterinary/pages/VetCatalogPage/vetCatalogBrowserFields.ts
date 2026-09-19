import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import {
  PROCEDURE_TYPES,
  type VetMedicationCatalogItem,
  type VetProcedureCatalogItem,
} from '../../veterinary.types';

export const MEDICATION_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export type MedicationSortKey = 'name-asc' | 'name-desc';

export const MEDICATION_COMPARATORS: Record<
  MedicationSortKey,
  (a: VetMedicationCatalogItem, b: VetMedicationCatalogItem) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveMedicationSortKey(
  sortTile: SortTile | null
): MedicationSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesMedicationQuery(
  item: VetMedicationCatalogItem,
  query: string
): boolean {
  return (
    item.name.toLowerCase().includes(query) ||
    (item.default_dose ?? '').toLowerCase().includes(query)
  );
}

export const PROCEDURE_FILTER_FIELDS: FilterField[] = [
  {
    id: 'type',
    label: 'Type',
    type: 'select',
    defaultValue: PROCEDURE_TYPES[0],
    options: PROCEDURE_TYPES.map((type) => ({ value: type, label: type })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  },
];

export const PROCEDURE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'description',
    label: 'Description',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export type ProcedureSortKey = 'description-asc' | 'description-desc';

export const PROCEDURE_COMPARATORS: Record<
  ProcedureSortKey,
  (a: VetProcedureCatalogItem, b: VetProcedureCatalogItem) => number
> = {
  'description-asc': (a, b) => a.description.localeCompare(b.description),
  'description-desc': (a, b) => b.description.localeCompare(a.description),
};

export function deriveProcedureSortKey(
  sortTile: SortTile | null
): ProcedureSortKey {
  if (!sortTile) return 'description-asc';
  return sortTile.direction === 'desc'
    ? 'description-desc'
    : 'description-asc';
}

export function matchesProcedureQuery(
  item: VetProcedureCatalogItem,
  query: string
): boolean {
  return (
    item.description.toLowerCase().includes(query) ||
    item.procedure_type.toLowerCase().includes(query)
  );
}

/** The one filter tile here (Type) is entirely client-side - this personal
 * catalog has no query params today. */
export function applyProcedureFilters(
  procedures: VetProcedureCatalogItem[],
  tiles: FilterTile[]
): VetProcedureCatalogItem[] {
  let result = procedures;

  for (const tile of tiles) {
    if (tile.fieldId === 'type' && typeof tile.value === 'string') {
      result = result.filter((item) => item.procedure_type === tile.value);
    }
  }

  return result;
}
