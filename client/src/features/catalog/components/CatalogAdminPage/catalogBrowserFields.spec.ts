import { describe, expect, it } from 'vitest';
import {
  applyCatalogFilters,
  buildCatalogFilterFields,
  buildCatalogGroupByAxes,
  CATALOG_COMPARATORS,
  deriveCatalogSortKey,
  matchesCatalogQuery,
} from './catalogBrowserFields';
import type { CatalogItem } from './CatalogAdminPage';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';

function buildItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: '1',
    name: 'Dry kibble',
    category: 'food',
    service_scope: 'hotel',
    price: 50,
    is_active: true,
    ...overrides,
  };
}

describe('buildCatalogFilterFields', () => {
  it('derives Category/Service scope options from the actual items, not a fixed list', () => {
    const items = [
      buildItem({ category: 'food', service_scope: 'hotel' }),
      buildItem({ id: '2', category: 'medication', service_scope: 'general' }),
    ];
    const fields = buildCatalogFilterFields(items);
    const category = fields.find((f) => f.id === 'category');
    const scope = fields.find((f) => f.id === 'serviceScope');

    expect(category?.type).toBe('select');
    if (category?.type === 'select') {
      expect(category.options.map((o) => o.value)).toEqual([
        'food',
        'medication',
      ]);
    }
    if (scope?.type === 'select') {
      expect(scope.options.map((o) => o.value)).toEqual(['general', 'hotel']);
    }
  });
});

describe('applyCatalogFilters', () => {
  const items = [
    buildItem({ id: '1', category: 'food', is_active: true }),
    buildItem({ id: '2', category: 'medication', is_active: false }),
  ];

  it('narrows by category', () => {
    const tiles: FilterTile[] = [{ fieldId: 'category', value: 'medication' }];
    expect(applyCatalogFilters(items, tiles).map((i) => i.id)).toEqual(['2']);
  });

  it('narrows by status', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyCatalogFilters(items, tiles).map((i) => i.id)).toEqual(['2']);
  });
});

describe('matchesCatalogQuery', () => {
  it('matches on name or category', () => {
    const item = buildItem({ name: 'Dry kibble', category: 'food' });
    expect(matchesCatalogQuery(item, 'dry')).toBe(true);
    expect(matchesCatalogQuery(item, 'food')).toBe(true);
    expect(matchesCatalogQuery(item, 'medication')).toBe(false);
  });
});

describe('deriveCatalogSortKey + CATALOG_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveCatalogSortKey(null)).toBe('name-asc');
  });

  it('sorts by price low to high', () => {
    const items = [
      buildItem({ id: '1', price: 100 }),
      buildItem({ id: '2', price: 20 }),
    ];
    expect(
      [...items].sort(CATALOG_COMPARATORS['price-asc']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('buildCatalogGroupByAxes', () => {
  it('offers Category (dynamic) and Status axes', () => {
    const items = [buildItem({ category: 'food' })];
    const axes = buildCatalogGroupByAxes(items);
    expect(axes.map((a) => a.id)).toEqual(['category', 'status']);
    expect(axes[0].columns).toEqual(['food']);
  });
});
