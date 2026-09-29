import type {
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  MEDICINE_TYPE_OPTIONS,
  type ConsultationFormTemplate,
  type VetMedicationCatalogItem,
  type VetPrescriptionTemplate,
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
    (item.default_medicine_type ?? '').toLowerCase().includes(query)
  );
}

const OTHER_MEDICINE_TYPE = 'Other';

/** Custom change ("add missing group by and view options to my catalog >
 * medications"): Board view's columns - every suggested medicine type, plus
 * a catch-all "Other" bucket for a free-typed value outside that list. Same
 * shape as PrescriptionsPage's own MEDICINE_TYPE_GROUP_AXIS, adapted to
 * VetMedicationCatalogItem's field name. */
export const MEDICATION_GROUP_AXIS: GroupByAxis<VetMedicationCatalogItem> = {
  id: 'medicine-type',
  label: 'Medicine Type',
  columns: [...MEDICINE_TYPE_OPTIONS, OTHER_MEDICINE_TYPE],
  columnFor: (item) =>
    item.default_medicine_type &&
    MEDICINE_TYPE_OPTIONS.includes(item.default_medicine_type)
      ? item.default_medicine_type
      : OTHER_MEDICINE_TYPE,
};

// #117: PROCEDURE_FILTER_FIELDS/PROCEDURE_SORT_FIELDS/PROCEDURE_COMPARATORS/
// deriveProcedureSortKey/matchesProcedureQuery/applyProcedureFilters removed
// alongside the rest of the personal procedure catalog - replaced by the
// consultation-form-template exports below (same minimal name-only
// search+sort shape the Medications tab above already uses - no filter
// tiles, this is a small owner-scoped list).

export const CONSULTATION_FORM_TEMPLATE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export type ConsultationFormTemplateSortKey = 'name-asc' | 'name-desc';

export const CONSULTATION_FORM_TEMPLATE_COMPARATORS: Record<
  ConsultationFormTemplateSortKey,
  (a: ConsultationFormTemplate, b: ConsultationFormTemplate) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveConsultationFormTemplateSortKey(
  sortTile: SortTile | null
): ConsultationFormTemplateSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesConsultationFormTemplateQuery(
  item: ConsultationFormTemplate,
  query: string
): boolean {
  return (
    item.name.toLowerCase().includes(query) ||
    item.fields.some((field) => field.label.toLowerCase().includes(query))
  );
}

/** Custom change ("break down my catalog > medications: have medications
 * AND prescriptions"): same minimal name-only search+sort shape as
 * Medications/Forms above. */
export const PRESCRIPTION_TEMPLATE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export type PrescriptionTemplateSortKey = 'name-asc' | 'name-desc';

export const PRESCRIPTION_TEMPLATE_COMPARATORS: Record<
  PrescriptionTemplateSortKey,
  (a: VetPrescriptionTemplate, b: VetPrescriptionTemplate) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function derivePrescriptionTemplateSortKey(
  sortTile: SortTile | null
): PrescriptionTemplateSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesPrescriptionTemplateQuery(
  item: VetPrescriptionTemplate,
  query: string
): boolean {
  return (
    item.name.toLowerCase().includes(query) ||
    item.items.some((line) => line.name.toLowerCase().includes(query))
  );
}
