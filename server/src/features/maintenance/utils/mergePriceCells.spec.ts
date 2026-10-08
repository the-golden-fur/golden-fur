import { describe, expect, it } from 'vitest';
import { mergePriceCells } from './mergePriceCells.ts';

const DERIVED = [
  { weight_class: 'S' as const, coat_type: 'SC' as const, price: 300 },
  { weight_class: 'L' as const, coat_type: 'LC' as const, price: 520 },
];

describe('mergePriceCells', () => {
  it('keeps the formula price for cells nobody set', () => {
    expect(mergePriceCells(DERIVED, [])).toEqual([
      { weight_class: 'S', coat_type: 'SC', price: 300, is_custom: false },
      { weight_class: 'L', coat_type: 'LC', price: 520, is_custom: false },
    ]);
  });

  it("uses the item's own price for a cell a Superadmin set", () => {
    expect(
      mergePriceCells(DERIVED, [
        // numeric columns come back from PostgREST as strings
        { weight_class: 'L', coat_type: 'LC', price: '650.00' as never },
      ])
    ).toEqual([
      { weight_class: 'S', coat_type: 'SC', price: 300, is_custom: false },
      { weight_class: 'L', coat_type: 'LC', price: 650, is_custom: true },
    ]);
  });

  it('treats missing overrides as none', () => {
    expect(mergePriceCells(DERIVED, undefined)[0].is_custom).toBe(false);
  });
});
