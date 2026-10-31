import { describe, expect, it } from 'vitest';
import {
  applyStaffItemFilters,
  deriveStaffItemSortKey,
  matchesStaffItemQuery,
  STAFF_ITEM_COMPARATORS,
  STAFF_ITEM_GROUP_BY_AXES,
} from './staffItemBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { StaffCatalogItem } from '../../staffItems.types';

function buildItem(
  overrides: Partial<StaffCatalogItem> = {}
): StaffCatalogItem {
  return {
    id: '1',
    owner_staff_id: 'staff-1',
    name: 'Chicken kibble',
    quantity: '1',
    quantity_unit: 'cup',
    special_instructions: null,
    photo_url: null,
    is_public: false,
    archived_at: null,
    created_at: '',
    updated_at: '',
    kind: 'food',
    ...overrides,
  } as StaffCatalogItem;
}

describe('applyStaffItemFilters', () => {
  it('narrows by category', () => {
    const items = [
      buildItem({ id: '1', kind: 'food' }),
      buildItem({ id: '2', kind: 'medication' }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'category', value: 'medication' }];
    expect(applyStaffItemFilters(items, tiles).map((i) => i.id)).toEqual(['2']);
  });

  it('narrows by visibility', () => {
    const items = [
      buildItem({ id: '1', is_public: true }),
      buildItem({ id: '2', is_public: false }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'visibility', value: 'private' }];
    expect(applyStaffItemFilters(items, tiles).map((i) => i.id)).toEqual(['2']);
  });
});

describe('matchesStaffItemQuery', () => {
  it('matches on name', () => {
    const item = buildItem({ name: 'Chicken kibble' });
    expect(matchesStaffItemQuery(item, 'chicken')).toBe(true);
    expect(matchesStaffItemQuery(item, 'salmon')).toBe(false);
  });
});

describe('deriveStaffItemSortKey + STAFF_ITEM_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveStaffItemSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const items = [
      buildItem({ id: '1', name: 'Salmon oil' }),
      buildItem({ id: '2', name: 'Amoxicillin' }),
    ];
    expect(
      [...items].sort(STAFF_ITEM_COMPARATORS['name-asc']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('STAFF_ITEM_GROUP_BY_AXES', () => {
  it('groups by Category (Food/Medication)', () => {
    const axis = STAFF_ITEM_GROUP_BY_AXES.find((a) => a.id === 'category')!;
    expect(axis.columns).toEqual(['Food', 'Medication']);
    expect(axis.columnFor(buildItem({ kind: 'medication' }))).toBe(
      'Medication'
    );
  });

  it('groups by Visibility (Public/Private)', () => {
    const axis = STAFF_ITEM_GROUP_BY_AXES.find((a) => a.id === 'visibility')!;
    expect(axis.columns).toEqual(['Public', 'Private']);
    expect(axis.columnFor(buildItem({ is_public: true }))).toBe('Public');
    expect(axis.columnFor(buildItem({ is_public: false }))).toBe('Private');
  });
});
