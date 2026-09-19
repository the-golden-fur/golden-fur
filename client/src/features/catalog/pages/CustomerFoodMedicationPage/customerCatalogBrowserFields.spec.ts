import { describe, expect, it } from 'vitest';
import {
  applyCustomerCatalogFilters,
  CUSTOMER_CATALOG_COMPARATORS,
  CUSTOMER_CATALOG_GROUP_BY_AXES,
  deriveCustomerCatalogSortKey,
  matchesCustomerCatalogQuery,
} from './customerCatalogBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { ProductCatalogItem } from '../../catalog.types';

function buildItem(
  overrides: Partial<ProductCatalogItem> = {}
): ProductCatalogItem {
  return {
    id: '1',
    name: 'Chicken kibble',
    category: 'food',
    service_scope: 'hotel',
    price: 0,
    is_active: true,
    archived_at: null,
    created_at: '',
    updated_at: '',
    owner_customer_id: 'customer-1',
    ...overrides,
  };
}

describe('applyCustomerCatalogFilters', () => {
  it('narrows by category', () => {
    const items = [
      buildItem({ id: '1', category: 'food' }),
      buildItem({ id: '2', category: 'medication' }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'category', value: 'medication' }];
    expect(applyCustomerCatalogFilters(items, tiles).map((i) => i.id)).toEqual([
      '2',
    ]);
  });
});

describe('matchesCustomerCatalogQuery', () => {
  it('matches on name', () => {
    const item = buildItem({ name: 'Chicken kibble' });
    expect(matchesCustomerCatalogQuery(item, 'chicken')).toBe(true);
    expect(matchesCustomerCatalogQuery(item, 'salmon')).toBe(false);
  });
});

describe('deriveCustomerCatalogSortKey + CUSTOMER_CATALOG_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveCustomerCatalogSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const items = [
      buildItem({ id: '1', name: 'Salmon oil' }),
      buildItem({ id: '2', name: 'Amoxicillin' }),
    ];
    expect(
      [...items].sort(CUSTOMER_CATALOG_COMPARATORS['name-asc']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('CUSTOMER_CATALOG_GROUP_BY_AXES', () => {
  it('groups by Category (Food/Medication)', () => {
    const axis = CUSTOMER_CATALOG_GROUP_BY_AXES[0];
    expect(axis.columns).toEqual(['Food', 'Medication']);
    expect(axis.columnFor(buildItem({ category: 'medication' }))).toBe(
      'Medication'
    );
  });
});
