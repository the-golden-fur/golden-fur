import { describe, expect, it } from 'vitest';
import type { CatalogComboBoxItem } from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import {
  buildMiscSaleItems,
  cartRowSubtotal,
  cartSubtotal,
  emptyCartRow,
  isCartRowValid,
  isCartValid,
  type CartRow,
} from './miscSaleCart';

const PRODUCTS: CatalogComboBoxItem[] = [
  { id: 'catalog-1', name: 'Dog Leash', price: 200 },
];

function catalogRow(overrides: Partial<CartRow> = {}): CartRow {
  return {
    id: 'row-1',
    catalogId: 'catalog-1',
    text: 'Dog Leash',
    quantity: 2,
    freetextAmount: '',
    ...overrides,
  };
}

function freetextRow(overrides: Partial<CartRow> = {}): CartRow {
  return {
    id: 'row-1',
    catalogId: null,
    text: 'Cat toy',
    quantity: 1,
    freetextAmount: '80',
    ...overrides,
  };
}

describe('emptyCartRow', () => {
  it('starts as an invalid, empty freetext row with the given id', () => {
    const row = emptyCartRow('row-0');

    expect(row).toEqual({
      id: 'row-0',
      catalogId: null,
      text: '',
      quantity: 1,
      freetextAmount: '',
    });
    expect(isCartRowValid(row)).toBe(false);
  });
});

describe('isCartRowValid', () => {
  it('a catalog row is valid regardless of freetext fields', () => {
    expect(isCartRowValid(catalogRow())).toBe(true);
  });

  it('a freetext row needs non-empty text and a positive amount', () => {
    expect(isCartRowValid(freetextRow())).toBe(true);
    expect(isCartRowValid(freetextRow({ text: '' }))).toBe(false);
    expect(isCartRowValid(freetextRow({ text: '   ' }))).toBe(false);
    expect(isCartRowValid(freetextRow({ freetextAmount: '0' }))).toBe(false);
    expect(isCartRowValid(freetextRow({ freetextAmount: '' }))).toBe(false);
    expect(isCartRowValid(freetextRow({ freetextAmount: '-5' }))).toBe(false);
  });
});

describe('isCartValid', () => {
  it('is false for an empty cart', () => {
    expect(isCartValid([])).toBe(false);
  });

  it('requires every row to be valid', () => {
    expect(isCartValid([catalogRow(), freetextRow()])).toBe(true);
    expect(isCartValid([catalogRow(), emptyCartRow('row-2')])).toBe(false);
  });
});

describe('cartRowSubtotal / cartSubtotal', () => {
  it("a catalog row's subtotal is the product's current price times quantity", () => {
    expect(cartRowSubtotal(catalogRow({ quantity: 3 }), PRODUCTS)).toBe(600);
  });

  it("a freetext row's subtotal is its own amount, ignoring quantity", () => {
    expect(
      cartRowSubtotal(freetextRow({ freetextAmount: '80' }), PRODUCTS)
    ).toBe(80);
  });

  it('a catalog row referencing a product no longer in the list falls back to 0', () => {
    expect(
      cartRowSubtotal(catalogRow({ catalogId: 'missing' }), PRODUCTS)
    ).toBe(0);
  });

  it('sums every row for the cart total', () => {
    expect(
      cartSubtotal([catalogRow({ quantity: 2 }), freetextRow()], PRODUCTS)
    ).toBe(480);
  });
});

describe('buildMiscSaleItems', () => {
  it('converts a catalog row to a product_catalog_id + quantity item', () => {
    expect(buildMiscSaleItems([catalogRow({ quantity: 2 })])).toEqual([
      { product_catalog_id: 'catalog-1', quantity: 2 },
    ]);
  });

  it('converts a freetext row to a description + amount item, trimming the description', () => {
    expect(
      buildMiscSaleItems([
        freetextRow({ text: '  Cat toy  ', freetextAmount: '80' }),
      ])
    ).toEqual([{ description: 'Cat toy', amount: 80 }]);
  });

  it('drops an in-progress invalid row rather than sending a malformed item', () => {
    expect(buildMiscSaleItems([emptyCartRow('row-0'), freetextRow()])).toEqual([
      { description: 'Cat toy', amount: 80 },
    ]);
  });
});
