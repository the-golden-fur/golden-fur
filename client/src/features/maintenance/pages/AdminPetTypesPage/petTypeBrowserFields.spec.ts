import { describe, expect, it } from 'vitest';
import {
  applyPetTypeFilters,
  deriveSortKey,
  matchesPetTypeQuery,
  PET_TYPE_COMPARATORS,
  PET_TYPE_GROUP_BY_AXES,
} from './petTypeBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { PetTypeRow } from '../../maintenance.types';

function buildPetType(overrides: Partial<PetTypeRow> = {}): PetTypeRow {
  return {
    id: 'pt-1',
    key: 'Dog',
    name: 'Dog',
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('applyPetTypeFilters', () => {
  const petTypes = [
    buildPetType({ id: '1', key: 'Dog', name: 'Dog', is_active: true }),
    buildPetType({ id: '2', key: 'Cat', name: 'Cat', is_active: false }),
  ];

  it('narrows to Active-only when a status:active tile is present', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'active' }];
    expect(applyPetTypeFilters(petTypes, tiles).map((p) => p.id)).toEqual([
      '1',
    ]);
  });

  it('narrows to Inactive-only when a status:inactive tile is present', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'inactive' }];
    expect(applyPetTypeFilters(petTypes, tiles).map((p) => p.id)).toEqual([
      '2',
    ]);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyPetTypeFilters(petTypes, []).map((p) => p.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('matchesPetTypeQuery', () => {
  it('matches on name only - key is an internal join value, not searchable', () => {
    const petType = buildPetType({ name: 'Dog', key: 'internal-join-value' });
    expect(matchesPetTypeQuery(petType, 'dog')).toBe(true);
    expect(matchesPetTypeQuery(petType, 'cat')).toBe(false);
    expect(matchesPetTypeQuery(petType, 'internal-join-value')).toBe(false);
  });
});

describe('deriveSortKey + PET_TYPE_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const petTypes = [
      buildPetType({ id: '1', name: 'Dog' }),
      buildPetType({ id: '2', name: 'Bird' }),
    ];
    expect(
      [...petTypes].sort(PET_TYPE_COMPARATORS['name-asc']).map((p) => p.id)
    ).toEqual(['2', '1']);
  });
});

describe('PET_TYPE_GROUP_BY_AXES', () => {
  it('offers a Status axis with Active/Inactive columns', () => {
    expect(PET_TYPE_GROUP_BY_AXES).toHaveLength(1);
    expect(PET_TYPE_GROUP_BY_AXES[0].columns).toEqual(['Active', 'Inactive']);
    expect(
      PET_TYPE_GROUP_BY_AXES[0].columnFor(buildPetType({ is_active: true }))
    ).toBe('Active');
    expect(
      PET_TYPE_GROUP_BY_AXES[0].columnFor(buildPetType({ is_active: false }))
    ).toBe('Inactive');
  });
});
