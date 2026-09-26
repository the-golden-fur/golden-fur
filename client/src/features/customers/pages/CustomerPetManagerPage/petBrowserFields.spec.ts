import { describe, expect, it } from 'vitest';
import {
  applyPetFilters,
  buildPetFilterFields,
  buildPetGroupByAxes,
  derivePetSortKey,
  matchesPetQuery,
  PET_COMPARATORS,
} from './petBrowserFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { Pet } from '../../customer.types';

function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'p-1',
    customer_id: 'c-1',
    name: 'Bantay',
    pet_type: 'Dog',
    breed_id: null,
    photo_url: null,
    gender: null,
    date_of_birth: null,
    weight_class: 'M',
    coat_type: 'SC',
    assessed_by: null,
    assessed_at: '2026-01-01T00:00:00.000Z',
    is_active: true,
    weight_kg: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  } as Pet;
}

describe('buildPetFilterFields', () => {
  it('derives Pet type options from the actual pets, not a fixed list', () => {
    const pets = [
      buildPet({ pet_type: 'Dog' }),
      buildPet({ id: 'p-2', pet_type: 'Cat' }),
    ];
    const fields = buildPetFilterFields(pets);
    const petType = fields.find((f) => f.id === 'petType');
    if (petType?.type === 'select') {
      expect(petType.options.map((o) => o.value)).toEqual(['Cat', 'Dog']);
    }
  });
});

describe('applyPetFilters', () => {
  const pets = [
    buildPet({
      id: '1',
      pet_type: 'Dog',
      weight_class: 'S',
      assessed_at: '2026-01-01',
    }),
    buildPet({
      id: '2',
      pet_type: 'Cat',
      weight_class: 'M',
      assessed_at: null,
    }),
  ];

  it('narrows by pet type', () => {
    const tiles: FilterTile[] = [{ fieldId: 'petType', value: 'Cat' }];
    expect(applyPetFilters(pets, tiles).map((p) => p.id)).toEqual(['2']);
  });

  it('narrows by weight class', () => {
    const tiles: FilterTile[] = [{ fieldId: 'weightClass', value: 'S' }];
    expect(applyPetFilters(pets, tiles).map((p) => p.id)).toEqual(['1']);
  });

  it('narrows by assessment status', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'assessment', value: 'not-assessed' },
    ];
    expect(applyPetFilters(pets, tiles).map((p) => p.id)).toEqual(['2']);
  });
});

describe('matchesPetQuery', () => {
  it('matches on name or pet type', () => {
    const pet = buildPet({ name: 'Bantay', pet_type: 'Dog' });
    expect(matchesPetQuery(pet, 'bantay')).toBe(true);
    expect(matchesPetQuery(pet, 'dog')).toBe(true);
    expect(matchesPetQuery(pet, 'cat')).toBe(false);
  });
});

describe('derivePetSortKey + PET_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(derivePetSortKey(null)).toBe('name-asc');
  });

  it('sorts by name A to Z', () => {
    const pets = [
      buildPet({ id: '1', name: 'Whiskers' }),
      buildPet({ id: '2', name: 'Bantay' }),
    ];
    expect(
      [...pets].sort(PET_COMPARATORS['name-asc']).map((p) => p.id)
    ).toEqual(['2', '1']);
  });
});

describe('buildPetGroupByAxes', () => {
  it('offers Pet type (dynamic) and Assessment axes', () => {
    const pets = [buildPet({ pet_type: 'Dog' })];
    const axes = buildPetGroupByAxes(pets);
    expect(axes.map((a) => a.id)).toEqual(['petType', 'assessment']);
    expect(axes[0].columns).toEqual(['Dog']);
  });
});
