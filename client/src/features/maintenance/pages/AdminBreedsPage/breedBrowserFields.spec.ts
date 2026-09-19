import { describe, expect, it } from 'vitest';
import {
  applyBreedFilters,
  buildBreedFilterFields,
  buildBreedGroupByAxes,
  deriveBreedSortKey,
  matchesBreedQuery,
  BREED_COMPARATORS,
} from './breedBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Breed, PetTypeRow } from '../../maintenance.types';

const PET_TYPES: PetTypeRow[] = [
  {
    id: 'pt-dog',
    key: 'Dog',
    name: 'Dog',
    is_active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'pt-cat',
    key: 'Cat',
    name: 'Cat',
    is_active: true,
    created_at: '',
    updated_at: '',
  },
];

function buildBreed(overrides: Partial<Breed> = {}): Breed {
  return {
    id: 'b-1',
    pet_type: 'Dog',
    name: 'Beagle',
    created_at: '',
    ...overrides,
  };
}

describe('buildBreedFilterFields', () => {
  it('builds a Pet type select field defaulting to the first pet type', () => {
    const fields = buildBreedFilterFields(PET_TYPES);
    expect(fields[0].id).toBe('petType');
    expect(fields[0].defaultValue).toBe('Dog');
    expect(fields[0].formatValue('Cat')).toBe('Cat');
  });
});

describe('applyBreedFilters', () => {
  const breeds = [
    buildBreed({ id: '1', pet_type: 'Dog', name: 'Beagle' }),
    buildBreed({ id: '2', pet_type: 'Cat', name: 'Persian' }),
  ];

  it('narrows to one pet type when a tile is present', () => {
    const tiles: FilterTile[] = [{ fieldId: 'petType', value: 'Cat' }];
    expect(applyBreedFilters(breeds, tiles).map((b) => b.id)).toEqual(['2']);
  });

  it('returns everything with no tiles', () => {
    expect(applyBreedFilters(breeds, []).map((b) => b.id)).toEqual(['1', '2']);
  });
});

describe('matchesBreedQuery', () => {
  it('matches on breed name', () => {
    const breed = buildBreed({ name: 'Beagle' });
    expect(matchesBreedQuery(breed, 'beag')).toBe(true);
    expect(matchesBreedQuery(breed, 'persian')).toBe(false);
  });
});

describe('deriveBreedSortKey + BREED_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveBreedSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const breeds = [
      buildBreed({ id: '1', name: 'Poodle' }),
      buildBreed({ id: '2', name: 'Beagle' }),
    ];
    expect(
      [...breeds].sort(BREED_COMPARATORS['name-asc']).map((b) => b.id)
    ).toEqual(['2', '1']);
  });
});

describe('buildBreedGroupByAxes', () => {
  it('offers one axis, columns matching the pet type keys', () => {
    const axes = buildBreedGroupByAxes(PET_TYPES);
    expect(axes).toHaveLength(1);
    expect(axes[0].columns).toEqual(['Dog', 'Cat']);
    expect(axes[0].columnFor(buildBreed({ pet_type: 'Cat' }))).toBe('Cat');
  });
});
