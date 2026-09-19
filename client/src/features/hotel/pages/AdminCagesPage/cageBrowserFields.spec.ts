import { describe, expect, it } from 'vitest';
import {
  applyCageFilters,
  buildCageFilterFields,
  CAGE_COMPARATORS,
  CAGE_GROUP_BY_AXES,
  deriveCageSortKey,
  matchesCageQuery,
} from './cageBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Cage } from '../../hotel.types';

const PET_TYPES = [
  { id: 'pt-dog', key: 'Dog', name: 'Dog', is_active: true },
  { id: 'pt-cat', key: 'Cat', name: 'Cat', is_active: true },
];

function buildCage(overrides: Partial<Cage> = {}): Cage {
  return {
    id: 'cage-1',
    branch_id: 'branch-1',
    cage_label: 'Makati-S-01',
    size: 'S',
    status: 'Available',
    pet_types: ['Dog'],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('buildCageFilterFields', () => {
  it('builds a Pet type field as multi-select, defaulting to an empty selection', () => {
    const fields = buildCageFilterFields(PET_TYPES);
    const petTypeField = fields.find((field) => field.id === 'petType');

    expect(petTypeField?.type).toBe('multi-select');
    expect(petTypeField?.defaultValue).toEqual([]);
    expect(petTypeField?.formatValue(['Dog', 'Cat'])).toBe('Dog, Cat');
    expect(petTypeField?.formatValue([])).toBe('Any');
  });
});

describe('applyCageFilters', () => {
  const cages = [
    buildCage({ id: '1', size: 'S', status: 'Available', pet_types: ['Dog'] }),
    buildCage({ id: '2', size: 'M', status: 'Occupied', pet_types: ['Cat'] }),
    buildCage({
      id: '3',
      size: 'S',
      status: 'Available',
      pet_types: ['Dog', 'Cat'],
    }),
  ];

  it('narrows by a single-select size tile', () => {
    const tiles: FilterTile[] = [{ fieldId: 'size', value: 'S' }];
    expect(applyCageFilters(cages, tiles).map((c) => c.id)).toEqual([
      '1',
      '3',
    ]);
  });

  it('narrows by a multi-select pet-type tile using "matches any"', () => {
    const tiles: FilterTile[] = [{ fieldId: 'petType', value: ['Cat'] }];
    expect(applyCageFilters(cages, tiles).map((c) => c.id)).toEqual([
      '2',
      '3',
    ]);
  });

  it('combines multiple tiles with AND', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'status', value: 'Available' },
      { fieldId: 'petType', value: ['Cat'] },
    ];
    expect(applyCageFilters(cages, tiles).map((c) => c.id)).toEqual(['3']);
  });

  it('ignores an empty multi-select value', () => {
    const tiles: FilterTile[] = [{ fieldId: 'petType', value: [] }];
    expect(applyCageFilters(cages, tiles).map((c) => c.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});

describe('matchesCageQuery', () => {
  it('matches on cage label or a supported pet type', () => {
    const cage = buildCage({ cage_label: 'Makati-S-01', pet_types: ['Dog'] });
    expect(matchesCageQuery(cage, 'makati')).toBe(true);
    expect(matchesCageQuery(cage, 'dog')).toBe(true);
    expect(matchesCageQuery(cage, 'southwoods')).toBe(false);
  });
});

describe('deriveCageSortKey + CAGE_COMPARATORS', () => {
  it('sorts by label A-Z by default direction', () => {
    expect(deriveCageSortKey({ fieldId: 'label', direction: 'asc' })).toBe(
      'label-asc'
    );
    const cages = [
      buildCage({ id: '1', cage_label: 'Makati-S-02' }),
      buildCage({ id: '2', cage_label: 'Makati-S-01' }),
    ];
    expect(
      [...cages].sort(CAGE_COMPARATORS['label-asc']).map((c) => c.id)
    ).toEqual(['2', '1']);
  });

  it('sorts by size, small to large', () => {
    expect(deriveCageSortKey({ fieldId: 'size', direction: 'asc' })).toBe(
      'size-asc'
    );
    const cages = [
      buildCage({ id: 'xl', size: 'XL' }),
      buildCage({ id: 's', size: 'S' }),
    ];
    expect(
      [...cages].sort(CAGE_COMPARATORS['size-asc']).map((c) => c.id)
    ).toEqual(['s', 'xl']);
  });

  it('defaults to label-asc when there is no sort tile', () => {
    expect(deriveCageSortKey(null)).toBe('label-asc');
  });
});

describe('CAGE_GROUP_BY_AXES', () => {
  it('offers Status and Size, but not Pet type (multi-valued)', () => {
    expect(CAGE_GROUP_BY_AXES.map((axis) => axis.id)).toEqual([
      'status',
      'size',
    ]);
  });
});
