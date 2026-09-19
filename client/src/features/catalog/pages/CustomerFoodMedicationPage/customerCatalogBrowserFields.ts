import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { ProductCatalogItem } from '../../catalog.types';

const CATEGORY_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'medication', label: 'Medication' },
];

export const CATEGORY_FILTER_FIELDS: FilterField[] = [
  {
    id: 'category',
    label: 'Category',
    type: 'select',
    defaultValue: 'food',
    options: CATEGORY_OPTIONS,
    formatValue: (value) =>
      CATEGORY_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  },
];

export type CustomerCatalogSortKey = 'name-asc' | 'name-desc';

export const CUSTOMER_CATALOG_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const CUSTOMER_CATALOG_COMPARATORS: Record<
  CustomerCatalogSortKey,
  (a: ProductCatalogItem, b: ProductCatalogItem) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

export function deriveCustomerCatalogSortKey(
  sortTile: SortTile | null
): CustomerCatalogSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesCustomerCatalogQuery(
  item: ProductCatalogItem,
  query: string
): boolean {
  return item.name.toLowerCase().includes(query);
}

export function applyCustomerCatalogFilters(
  items: ProductCatalogItem[],
  tiles: FilterTile[]
): ProductCatalogItem[] {
  let result = items;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'category' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((item) => item.category === tile.value);
    }
  }

  return result;
}

export const CUSTOMER_CATALOG_GROUP_BY_AXES: GroupByAxis<ProductCatalogItem>[] = [
  {
    id: 'category',
    label: 'Category',
    columns: ['Food', 'Medication'],
    columnFor: (item) => (item.category === 'food' ? 'Food' : 'Medication'),
  },
];
