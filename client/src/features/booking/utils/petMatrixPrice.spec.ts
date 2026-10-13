import { describe, expect, it } from 'vitest';
import {
  isPricedByPetCell,
  packagePriceForPet,
  servicePriceForPet,
  withLongStayPrice,
} from './petMatrixPrice';

const CELLS = [
  {
    weight_class: 'S' as const,
    coat_type: 'SC' as const,
    price: 300,
    is_custom: false,
  },
  {
    weight_class: 'L' as const,
    coat_type: 'LC' as const,
    price: 650,
    is_custom: true,
  },
];

const LARGE_LONG = { weight_class: 'L' as const, coat_type: 'LC' as const };
const UNASSESSED = { weight_class: null, coat_type: null };

const BATH = {
  category: 'Grooming' as const,
  base_price: 300,
  use_pricing_matrix: true,
  service_pricing_tiers: CELLS.map((cell) => ({
    ...cell,
    id: `bath:${cell.weight_class}:${cell.coat_type}`,
    service_id: 'bath',
  })),
};

describe('servicePriceForPet', () => {
  it("charges the pet's own cell for a Grooming service that varies by weight and coat", () => {
    expect(servicePriceForPet(BATH, LARGE_LONG, null)).toBe(650);
  });

  it('uses the base price when the switch is off, the pet is unassessed, or it is not Grooming', () => {
    expect(
      servicePriceForPet(
        { ...BATH, use_pricing_matrix: false },
        LARGE_LONG,
        null
      )
    ).toBe(300);
    expect(servicePriceForPet(BATH, UNASSESSED, null)).toBe(300);
    expect(
      servicePriceForPet({ ...BATH, category: 'Hotel' }, LARGE_LONG, null)
    ).toBe(300);
  });

  it("lets a pet type's fixed price win", () => {
    expect(servicePriceForPet(BATH, LARGE_LONG, 800)).toBe(800);
  });
});

describe('packagePriceForPet', () => {
  const PKG = {
    bundled_price: 450,
    use_pricing_matrix: true,
    pricing_tiers: CELLS,
  };

  it("charges the pet's own cell, else the bundled price", () => {
    expect(packagePriceForPet(PKG, LARGE_LONG, null)).toBe(650);
    expect(packagePriceForPet(PKG, UNASSESSED, null)).toBe(450);
    expect(
      packagePriceForPet(
        { ...PKG, use_pricing_matrix: false },
        LARGE_LONG,
        null
      )
    ).toBe(450);
    expect(packagePriceForPet(PKG, LARGE_LONG, 800)).toBe(800);
  });
});

describe('isPricedByPetCell', () => {
  it('is true only when the shown price is the pet’s own cell', () => {
    const item = {
      use_pricing_matrix: true,
      category: 'Grooming' as const,
      cells: CELLS,
    };

    expect(isPricedByPetCell(item, LARGE_LONG, null)).toBe(true);
    expect(isPricedByPetCell(item, UNASSESSED, null)).toBe(false);
    expect(isPricedByPetCell(item, LARGE_LONG, 800)).toBe(false);
    expect(
      isPricedByPetCell(
        { ...item, use_pricing_matrix: false },
        LARGE_LONG,
        null
      )
    ).toBe(false);
  });
});

describe('withLongStayPrice (Hotel long-stay rate)', () => {
  const HOTEL = {
    category: 'Hotel' as const,
    base_price: 850,
    long_stay_nightly_price: 750,
    min_nights_for_free_package: 5,
  };

  it('keeps the regular price under the long-stay night count', () => {
    expect(withLongStayPrice(HOTEL, 4).base_price).toBe(850);
  });

  it('swaps in the long-stay price from that night count up', () => {
    expect(withLongStayPrice(HOTEL, 5).base_price).toBe(750);
    expect(withLongStayPrice(HOTEL, 9).base_price).toBe(750);
  });

  it('leaves a service alone when it has no long-stay price, no night count, or is not Hotel', () => {
    expect(
      withLongStayPrice({ ...HOTEL, long_stay_nightly_price: null }, 9)
        .base_price
    ).toBe(850);
    expect(
      withLongStayPrice({ ...HOTEL, min_nights_for_free_package: null }, 9)
        .base_price
    ).toBe(850);
    expect(
      withLongStayPrice({ ...HOTEL, category: 'Grooming' as const }, 9)
        .base_price
    ).toBe(850);
  });
});
