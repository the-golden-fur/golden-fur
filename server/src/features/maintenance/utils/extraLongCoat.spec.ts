import { describe, expect, it } from 'vitest';
import { dropExtraLongCoat, findPetCell } from './extraLongCoat.ts';

const CELLS = [
  { weight_class: 'L', coat_type: 'SC', price: 500 },
  { weight_class: 'L', coat_type: 'LC', price: 600 },
  { weight_class: 'L', coat_type: 'XLC', price: 700 },
];

describe('dropExtraLongCoat', () => {
  it('leaves the XLC cells out when the item has no XLC prices', () => {
    expect(
      dropExtraLongCoat(CELLS, false).map((cell) => cell.coat_type)
    ).toEqual(['SC', 'LC']);
  });

  it('keeps every cell when it has them', () => {
    expect(dropExtraLongCoat(CELLS, true)).toHaveLength(3);
  });
});

describe('findPetCell', () => {
  it("is the pet's own cell", () => {
    expect(
      findPetCell(CELLS, { weight_class: 'L', coat_type: 'XLC' })?.price
    ).toBe(700);
  });

  it('falls back to the Long Coat cell for an XLC pet when there is no XLC cell', () => {
    expect(
      findPetCell(dropExtraLongCoat(CELLS, false), {
        weight_class: 'L',
        coat_type: 'XLC',
      })?.price
    ).toBe(600);
  });

  it('is undefined for an unassessed pet or a missing cell', () => {
    expect(
      findPetCell(CELLS, { weight_class: null, coat_type: null })
    ).toBeUndefined();
    expect(
      findPetCell(CELLS, { weight_class: 'S', coat_type: 'SC' })
    ).toBeUndefined();
  });
});
