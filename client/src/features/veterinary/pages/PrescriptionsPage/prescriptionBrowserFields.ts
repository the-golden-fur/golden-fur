import type {
  FilterField,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { MEDICINE_TYPE_OPTIONS } from '../../veterinary.types';

/** #117 staff-facing Prescriptions page: one row per prescribed medication
 * (a consultation with 3 medications produces 3 rows), flattened from
 * listPrescriptions()'s Consultation[]. */
export interface PrescriptionRow {
  consultationId: string;
  medicationIndex: number;
  petName: string;
  ownerName: string;
  date: string;
  name: string;
  dose: string;
  medicineType: string;
  frequency: string;
  duration: string;
  notes: string;
}

const OTHER_MEDICINE_TYPE = 'Other';

export const PRESCRIPTION_FILTER_FIELDS: FilterField[] = [
  {
    id: 'medicine-type',
    label: 'Medicine Type',
    type: 'select',
    defaultValue: MEDICINE_TYPE_OPTIONS[0],
    options: [
      ...MEDICINE_TYPE_OPTIONS.map((type) => ({ value: type, label: type })),
      { value: OTHER_MEDICINE_TYPE, label: OTHER_MEDICINE_TYPE },
    ],
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  },
];

export function applyPrescriptionFilters(
  rows: PrescriptionRow[],
  tiles: Array<{ fieldId: string; value: unknown }>
): PrescriptionRow[] {
  let result = rows;

  for (const tile of tiles) {
    if (tile.fieldId === 'medicine-type' && typeof tile.value === 'string') {
      result = result.filter((row) =>
        tile.value === OTHER_MEDICINE_TYPE
          ? !MEDICINE_TYPE_OPTIONS.includes(row.medicineType)
          : row.medicineType === tile.value
      );
    }
  }

  return result;
}

export const PRESCRIPTION_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'date',
    label: 'Date',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
  {
    id: 'pet-name',
    label: 'Pet name',
    directions: [{ value: 'az', label: 'A to Z' }],
  },
  {
    id: 'medicine-name',
    label: 'Medicine name',
    directions: [{ value: 'az', label: 'A to Z' }],
  },
];

export type PrescriptionSortKey =
  | 'date-desc'
  | 'date-asc'
  | 'pet-name'
  | 'medicine-name';

export const PRESCRIPTION_COMPARATORS: Record<
  PrescriptionSortKey,
  (a: PrescriptionRow, b: PrescriptionRow) => number
> = {
  'date-desc': (a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime(),
  'date-asc': (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  'pet-name': (a, b) => a.petName.localeCompare(b.petName),
  'medicine-name': (a, b) => a.name.localeCompare(b.name),
};

export function deriveSortKey(sortTile: SortTile | null): PrescriptionSortKey {
  if (!sortTile) return 'date-desc';
  if (sortTile.fieldId === 'date') {
    return sortTile.direction === 'asc' ? 'date-asc' : 'date-desc';
  }
  if (sortTile.fieldId === 'pet-name') return 'pet-name';
  if (sortTile.fieldId === 'medicine-name') return 'medicine-name';
  return 'date-desc';
}

export function matchesPrescriptionQuery(
  row: PrescriptionRow,
  query: string
): boolean {
  return (
    row.petName.toLowerCase().includes(query) ||
    row.ownerName.toLowerCase().includes(query) ||
    row.name.toLowerCase().includes(query) ||
    row.medicineType.toLowerCase().includes(query)
  );
}

/** Board view's columns - every suggested medicine type, plus a catch-all
 * "Other" bucket for free-typed values outside that list (a vet is never
 * blocked from typing something else - see MEDICINE_TYPE_OPTIONS' own
 * header note). */
export const MEDICINE_TYPE_GROUP_AXIS: GroupByAxis<PrescriptionRow> = {
  id: 'medicine-type',
  label: 'Medicine Type',
  columns: [...MEDICINE_TYPE_OPTIONS, OTHER_MEDICINE_TYPE],
  columnFor: (row) =>
    row.medicineType && MEDICINE_TYPE_OPTIONS.includes(row.medicineType)
      ? row.medicineType
      : OTHER_MEDICINE_TYPE,
};
