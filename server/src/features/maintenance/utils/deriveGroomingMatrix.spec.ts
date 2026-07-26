import { describe, expect, it } from 'vitest';
import { deriveGroomingMatrix } from './deriveGroomingMatrix.ts';
import type { PricingConfiguration } from '../maintenance.types.ts';

const CONFIG: PricingConfiguration = {
  id: 'pricing-config-1',
  size_s_multiplier: 1,
  size_m_multiplier: 1.1,
  size_l_multiplier: 1.25,
  size_xl_multiplier: 1.5,
  long_coat_addon: 50,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

describe('deriveGroomingMatrix', () => {
  it('#81: derives all 8 cells from base_price and the shared multipliers', () => {
    const matrix = deriveGroomingMatrix(300, CONFIG);

    expect(matrix).toHaveLength(8);
    expect(matrix).toEqual(
      expect.arrayContaining([
        { weight_class: 'S', coat_type: 'SC', price: 300 },
        { weight_class: 'S', coat_type: 'LC', price: 350 },
        { weight_class: 'M', coat_type: 'SC', price: 330 },
        { weight_class: 'M', coat_type: 'LC', price: 380 },
        { weight_class: 'L', coat_type: 'SC', price: 375 },
        { weight_class: 'L', coat_type: 'LC', price: 425 },
        { weight_class: 'XL', coat_type: 'SC', price: 450 },
        { weight_class: 'XL', coat_type: 'LC', price: 500 },
      ])
    );
  });

  it('rounds to 2 decimal places', () => {
    const matrix = deriveGroomingMatrix(99.99, {
      ...CONFIG,
      size_s_multiplier: 1.1,
    });

    const smallShortCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
    );

    expect(smallShortCoat?.price).toBe(109.99);
  });

  it('a zero long_coat_addon leaves Long Coat equal to Short Coat', () => {
    const matrix = deriveGroomingMatrix(300, {
      ...CONFIG,
      long_coat_addon: 0,
    });

    const shortCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
    );
    const longCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'LC'
    );

    expect(longCoat?.price).toBe(shortCoat?.price);
  });
});
