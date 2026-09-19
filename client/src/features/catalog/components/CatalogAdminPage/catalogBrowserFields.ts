import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { CatalogItem } from './CatalogAdminPage';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function distinctValues(items: CatalogItem[], key: 'category' | 'service_scope'): string[] {
  return Array.from(new Set(items.map((item) => item[key]))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Category/service_scope are free text (see CatalogAdminPage's own "docu-
 * mented, not enforced" note), so filter options come from whatever values
 * are actually present in the loaded items, not a fixed suggestion list. */
export function buildCatalogFilterFields(items: CatalogItem[]): FilterField[] {
  const categories = distinctValues(items, 'category');
  const scopes = distinctValues(items, 'service_scope');

  const categoryField: FilterField = {
    id: 'category',
    label: 'Category',
    type: 'select',
    defaultValue: categories[0] ?? '',
    options: categories.map((category) => ({ value: category, label: category })),
    formatValue: (value) => (typeof value === 'string' && value ? value : 'Any'),
  };

  const scopeField: FilterField = {
    id: 'serviceScope',
    label: 'Service scope',
    type: 'select',
    defaultValue: scopes[0] ?? '',
    options: scopes.map((scope) => ({ value: scope, label: scope })),
    formatValue: (value) => (typeof value === 'string' && value ? value : 'Any'),
  };

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  };

  return [categoryField, scopeField, statusField];
}

export type CatalogSortKey = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

export const CATALOG_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'price',
    label: 'Price',
    directions: [
      { value: 'asc', label: 'Low to high' },
      { value: 'desc', label: 'High to low' },
    ],
  },
];

export const CATALOG_COMPARATORS: Record<
  CatalogSortKey,
  (a: CatalogItem, b: CatalogItem) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
};

export function deriveCatalogSortKey(sortTile: SortTile | null): CatalogSortKey {
  if (!sortTile) return 'name-asc';
  if (sortTile.fieldId === 'price') {
    return sortTile.direction === 'desc' ? 'price-desc' : 'price-asc';
  }
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesCatalogQuery(item: CatalogItem, query: string): boolean {
  return (
    item.name.toLowerCase().includes(query) ||
    item.category.toLowerCase().includes(query)
  );
}

/** Every filter tile here is client-side only - the catalog list endpoints
 * have no query params today. */
export function applyCatalogFilters(
  items: CatalogItem[],
  tiles: FilterTile[]
): CatalogItem[] {
  let result = items;

  for (const tile of tiles) {
    if (
      tile.fieldId === 'category' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((item) => item.category === tile.value);
    }

    if (
      tile.fieldId === 'serviceScope' &&
      typeof tile.value === 'string' &&
      tile.value
    ) {
      result = result.filter((item) => item.service_scope === tile.value);
    }

    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((item) => item.is_active === wantActive);
    }
  }

  return result;
}

export function buildCatalogGroupByAxes(
  items: CatalogItem[]
): GroupByAxis<CatalogItem>[] {
  return [
    {
      id: 'category',
      label: 'Category',
      columns: distinctValues(items, 'category'),
      columnFor: (item) => item.category,
    },
    {
      id: 'status',
      label: 'Status',
      columns: ['Active', 'Inactive'],
      columnFor: (item) => (item.is_active ? 'Active' : 'Inactive'),
    },
  ];
}
