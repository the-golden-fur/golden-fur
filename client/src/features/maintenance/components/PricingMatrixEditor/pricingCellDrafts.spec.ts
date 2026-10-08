import { describe, expect, it } from 'vitest';
import { draftsFromCells, pricingCellsChanges } from './pricingCellDrafts';

describe('draftsFromCells', () => {
  it("keeps only the item's own (custom) cells", () => {
    expect(
      draftsFromCells([
        { weight_class: 'S', coat_type: 'SC', price: 300, is_custom: false },
        { weight_class: 'L', coat_type: 'LC', price: 650, is_custom: true },
      ])
    ).toEqual({ 'L:LC': '650' });
  });
});

describe('pricingCellsChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(
      pricingCellsChanges({ 'L:LC': '650' }, { 'L:LC': '650.00' })
    ).toEqual({ cells: [], error: null });
  });

  it('sends new and changed cells, and null for cells put back on the formula', () => {
    const { cells, error } = pricingCellsChanges(
      { 'L:LC': '650', 'S:SC': '280' },
      { 'L:LC': '700', 'M:SC': '400' }
    );

    expect(error).toBeNull();
    expect(cells).toEqual(
      expect.arrayContaining([
        { weight_class: 'L', coat_type: 'LC', price: 700 },
        { weight_class: 'S', coat_type: 'SC', price: null },
        { weight_class: 'M', coat_type: 'SC', price: 400 },
      ])
    );
    expect(cells).toHaveLength(3);
  });

  it('treats a cleared box as back to the formula', () => {
    expect(
      pricingCellsChanges({ 'L:LC': '650' }, { 'L:LC': '  ' }).cells
    ).toEqual([{ weight_class: 'L', coat_type: 'LC', price: null }]);
  });

  it('refuses a negative price, naming the cell', () => {
    const { cells, error } = pricingCellsChanges({}, { 'XL:LC': '-5' });

    expect(cells).toEqual([]);
    expect(error).toBe('Enter a valid price (0 or more) for XL, long coat.');
  });
});
