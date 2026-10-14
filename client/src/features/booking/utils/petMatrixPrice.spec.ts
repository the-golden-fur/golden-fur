import { describe, expect, it } from 'vitest';
import {
  findPetCell,
  isPricedByPetCell,
  matrixPriceFor,
  packageFixedPriceForPet,
  packagePriceForPet,
  servicePriceForPet,
  variesByWeightAndCoat,
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

describe('variesByWeightAndCoat', () => {
  const item = {
    use_pricing_matrix: true,
    category: 'Grooming' as const,
    cells: CELLS,
  };

  it('is true for a Grooming item on the weight x coat grid, whatever the pet', () => {
    expect(variesByWeightAndCoat(item, null)).toBe(true);
    // A package has no category.
    expect(
      variesByWeightAndCoat({ use_pricing_matrix: true, cells: CELLS }, null)
    ).toBe(true);
  });

  it('is false for a flat price, the switch off, a non-Grooming service, or no cells', () => {
    expect(variesByWeightAndCoat(item, 800)).toBe(false);
    expect(
      variesByWeightAndCoat({ ...item, use_pricing_matrix: false }, null)
    ).toBe(false);
    expect(variesByWeightAndCoat({ ...item, category: 'Hotel' }, null)).toBe(
      false
    );
    expect(variesByWeightAndCoat({ ...item, cells: [] }, null)).toBe(false);
  });
});

describe('Extra Long Coat pet on an item with no XLC prices (20261014265)', () => {
  const LARGE_XLC = { weight_class: 'L' as const, coat_type: 'XLC' as const };

  it("pays the Long Coat cell for its size, same as the server's findPetCell", () => {
    expect(findPetCell(CELLS, LARGE_XLC)?.coat_type).toBe('LC');
    expect(servicePriceForPet(BATH, LARGE_XLC, null)).toBe(650);
    expect(
      isPricedByPetCell(
        {
          use_pricing_matrix: true,
          category: 'Grooming' as const,
          cells: CELLS,
        },
        LARGE_XLC,
        null
      )
    ).toBe(true);
  });

  it('pays its own XLC cell when the item has one', () => {
    const cells = [
      ...CELLS,
      {
        weight_class: 'L' as const,
        coat_type: 'XLC' as const,
        price: 800,
        is_custom: true,
      },
    ];

    expect(findPetCell(cells, LARGE_XLC)?.price).toBe(800);
  });
});

describe('matrixPriceFor', () => {
  it("is the cell's own price, else the fallback", () => {
    expect(matrixPriceFor(CELLS, 'L', 'LC', 300)).toBe(650);
    expect(matrixPriceFor(CELLS, 'M', 'XLC', 300)).toBe(300);
    expect(matrixPriceFor(undefined, 'S', 'SC', 450)).toBe(450);
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

// Custom change (package cat price): one separate price for a cat, per package.
describe("a package's own cat price", () => {
  const PACKAGE = {
    bundled_price: 300,
    use_pricing_matrix: true,
    pricing_tiers: CELLS,
    cat_price: 650,
  };
  const CAT = { ...LARGE_LONG, pet_type: 'Cat' };
  const DOG = { ...LARGE_LONG, pet_type: 'Dog' };

  it('is what a cat pays, ahead of the pet type fixed price and the grid', () => {
    expect(packagePriceForPet(PACKAGE, CAT, 800)).toBe(650);
    expect(packagePriceForPet(PACKAGE, CAT, null)).toBe(650);
  });

  it('never applies to another pet type', () => {
    expect(packagePriceForPet(PACKAGE, DOG, null)).toBe(
      packagePriceForPet({ ...PACKAGE, cat_price: null }, DOG, null)
    );
    expect(packageFixedPriceForPet(PACKAGE, DOG, null)).toBeNull();
  });

  it('left empty, a cat is priced as before', () => {
    expect(packagePriceForPet({ ...PACKAGE, cat_price: null }, CAT, 800)).toBe(
      800
    );
  });

  it('a cat price of zero is honoured, not treated as empty', () => {
    expect(packagePriceForPet({ ...PACKAGE, cat_price: 0 }, CAT, 800)).toBe(0);
  });
});
