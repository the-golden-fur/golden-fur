import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { StaffCatalogItem } from '../../staffItems.types';

const CATEGORY_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'medication', label: 'Medication' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

export const STAFF_ITEM_FILTER_FIELDS: FilterField[] = [
  {
    id: 'category',
    label: 'Category',
    type: 'select',
    defaultValue: 'food',
    options: CATEGORY_OPTIONS,
    formatValue: (value) =>
      CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
  {
    id: 'visibility',
    label: 'Visibility',
    type: 'select',
    defaultValue: 'public',
    options: VISIBILITY_OPTIONS,
    formatValue: (value) =>
      VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  },
];

export type StaffItemSortKey = 'name-asc' | 'name-desc';

export const STAFF_ITEM_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const STAFF_ITEM_COMPARATORS: Record<
  StaffItemSortKey,
  (a: StaffCatalogItem, b: StaffCatalogItem) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveStaffItemSortKey(
  sortTile: SortTile | null
): StaffItemSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesStaffItemQuery(
  item: StaffCatalogItem,
  query: string
): boolean {
  return item.name.toLowerCase().includes(query);
}

export function applyStaffItemFilters(
  items: StaffCatalogItem[],
  tiles: FilterTile[]
): StaffCatalogItem[] {
  let result = items;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'category' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((item) => item.kind === tile.value);
    }
    if (
      tile.fieldId === 'visibility' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      const wantPublic = tile.value === 'public';
      result = result.filter((item) => item.is_public === wantPublic);
    }
  }

  return result;
}

/**
 * Two selectable axes, not one - the first group-by-axis picker in this
 * app (useGroupBy itself only ever takes a single axis at a time; every
 * existing consumer hardcodes which one). The page renders a small
 * <select> next to ViewSwitcher (Board view only) to choose between these.
 */
export const STAFF_ITEM_GROUP_BY_AXES: GroupByAxis<StaffCatalogItem>[] = [
  {
    id: 'category',
    label: 'Category',
    columns: ['Food', 'Medication'],
    columnFor: (item) => (item.kind === 'food' ? 'Food' : 'Medication'),
  },
  {
    id: 'visibility',
    label: 'Visibility',
    columns: ['Public', 'Private'],
    columnFor: (item) => (item.is_public ? 'Public' : 'Private'),
  },
];
