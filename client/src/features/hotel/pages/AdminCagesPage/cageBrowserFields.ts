import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { PetTypeRow } from '../../../maintenance/maintenance.types';
import type { Cage, CageSize, CageStatus } from '../../hotel.types';

export const CAGE_SIZES: CageSize[] = ['S', 'M', 'L', 'XL'];
export const CAGE_SIZE_LABELS: Record<CageSize, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
};

export const CAGE_STATUSES: CageStatus[] = [
  'Available',
  'Occupied',
  'Reserved',
  'Under Maintenance',
];

/** `petTypeOptions` comes from `listPetTypes` - rebuilt whenever that list
 * changes, same as AdminCagesPage's create-form checkboxes already do. */
export function buildCageFilterFields(
  petTypeOptions: PetTypeRow[]
): FilterField[] {
  const sizeField: FilterField = {
    id: 'size',
    label: 'Size',
    type: 'select',
    defaultValue: CAGE_SIZES[0],
    options: CAGE_SIZES.map((size) => ({
      value: size,
      label: CAGE_SIZE_LABELS[size],
    })),
    formatValue: (value) =>
      typeof value === 'string'
        ? (CAGE_SIZE_LABELS[value as CageSize] ?? value)
        : 'Any',
  };

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: CAGE_STATUSES[0],
    options: CAGE_STATUSES.map((status) => ({ value: status, label: status })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  };

  // Multi-select, not select: a cage can support more than one pet type
  // (Cage.pet_types is a string[]), so a single-choice filter would hide
  // cages that genuinely match - see filterField.types.ts's MultiSelectFilterField.
  const petTypeField: FilterField = {
    id: 'petType',
    label: 'Pet type',
    type: 'multi-select',
    defaultValue: [],
    options: petTypeOptions.map((petType) => ({
      value: petType.key,
      label: petType.name,
    })),
    formatValue: (value) => {
      const selected = Array.isArray(value) ? value : [];
      if (selected.length === 0) return 'Any';
      return selected
        .map((key) => petTypeOptions.find((pt) => pt.key === key)?.name ?? key)
        .join(', ');
    },
  };

  return [sizeField, statusField, petTypeField];
}

export type CageSortKey = 'label-asc' | 'label-desc' | 'size-asc' | 'size-desc';

export const CAGE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'label',
    label: 'Cage label',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'size',
    label: 'Size',
    directions: [
      { value: 'asc', label: 'Small to large' },
      { value: 'desc', label: 'Large to small' },
    ],
  },
];

const SIZE_ORDER: Record<CageSize, number> = { S: 0, M: 1, L: 2, XL: 3 };

export const CAGE_COMPARATORS: Record<
  CageSortKey,
  (a: Cage, b: Cage) => number
> = {
  'label-asc': (a, b) => a.cage_label.localeCompare(b.cage_label),
  'label-desc': (a, b) => b.cage_label.localeCompare(a.cage_label),
  'size-asc': (a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size],
  'size-desc': (a, b) => SIZE_ORDER[b.size] - SIZE_ORDER[a.size],
};

export function deriveCageSortKey(sortTile: SortTile | null): CageSortKey {
  if (!sortTile) return 'label-asc';
  if (sortTile.fieldId === 'size') {
    return sortTile.direction === 'desc' ? 'size-desc' : 'size-asc';
  }
  return sortTile.direction === 'desc' ? 'label-desc' : 'label-asc';
}

export function matchesCageQuery(cage: Cage, query: string): boolean {
  return (
    cage.cage_label.toLowerCase().includes(query) ||
    cage.pet_types.some((petType) => petType.toLowerCase().includes(query))
  );
}

/** Every filter tile here is client-side only (no server query params exist
 * for cages yet, per this rollout's "client-only" decision) - this is the
 * one function that actually narrows the list, applied alongside search. */
export function applyCageFilters(cages: Cage[], tiles: FilterTile[]): Cage[] {
  let result = cages;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'size' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((cage) => cage.size === tile.value);
    }
    if (
      tile.fieldId === 'status' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((cage) => cage.status === tile.value);
    }
    if (
      tile.fieldId === 'petType' &&
      Array.isArray(tile.value) &&
      tile.value.length > 0
    ) {
      const wanted = tile.value;
      result = result.filter((cage) =>
        cage.pet_types.some((petType) => wanted.includes(petType))
      );
    }
  }

  return result;
}

// Not offered as a group-by axis: a cage's pet_types is multi-valued, and
// columnFor must return exactly one column per item - forcing a many-to-one
// collapse (e.g. "first pet type only") would silently hide cages from
// columns they actually belong to. Status/Size are both single-valued.
export const CAGE_GROUP_BY_AXES: GroupByAxis<Cage>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: CAGE_STATUSES,
    columnFor: (cage) => cage.status,
  },
  {
    id: 'size',
    label: 'Size',
    columns: CAGE_SIZES,
    columnFor: (cage) => cage.size,
  },
];
