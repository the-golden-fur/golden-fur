import { describe, expect, it } from 'vitest';
import { deriveGroomingMatrix } from './deriveGroomingMatrix.ts';
import type { PricingConfiguration } from '../maintenance.types.ts';

const CONFIG: PricingConfiguration = {
  id: 'pricing-config-1',
  size_s_rule_type: 'multiplier',
  size_s_rule_value: 1,
  size_m_rule_type: 'multiplier',
  size_m_rule_value: 1.1,
  size_l_rule_type: 'multiplier',
  size_l_rule_value: 1.25,
  size_xl_rule_type: 'multiplier',
  size_xl_rule_value: 1.5,
  coat_long_rule_type: 'flat',
  coat_long_rule_value: 50,
  coat_extra_long_rule_type: 'flat',
  coat_extra_long_rule_value: 120,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

describe('deriveGroomingMatrix', () => {
  it('#81: derives all 12 cells (4 sizes x 3 coats) from base_price and the shared rules', () => {
    const matrix = deriveGroomingMatrix(300, CONFIG);

    expect(matrix).toHaveLength(12);
    expect(matrix).toEqual(
      expect.arrayContaining([
        { weight_class: 'S', coat_type: 'SC', price: 300 },
        { weight_class: 'S', coat_type: 'LC', price: 350 },
        { weight_class: 'S', coat_type: 'XLC', price: 420 },
        { weight_class: 'M', coat_type: 'SC', price: 330 },
        { weight_class: 'M', coat_type: 'LC', price: 380 },
        { weight_class: 'M', coat_type: 'XLC', price: 450 },
        { weight_class: 'L', coat_type: 'SC', price: 375 },
        { weight_class: 'L', coat_type: 'LC', price: 425 },
        { weight_class: 'L', coat_type: 'XLC', price: 495 },
        { weight_class: 'XL', coat_type: 'SC', price: 450 },
        { weight_class: 'XL', coat_type: 'LC', price: 500 },
        { weight_class: 'XL', coat_type: 'XLC', price: 570 },
      ])
    );
  });

  // Custom change (Extra Long Coat, 20261013261).
  describe('Extra Long Coat', () => {
    function cell(
      matrix: ReturnType<typeof deriveGroomingMatrix>,
      coatType: string
    ) {
      return matrix.find(
        (entry) => entry.weight_class === 'S' && entry.coat_type === coatType
      )?.price;
    }

    it('uses its own rule in place of the Long Coat one - the two never stack', () => {
      const matrix = deriveGroomingMatrix(300, {
        ...CONFIG,
        coat_long_rule_value: 50,
        coat_extra_long_rule_value: 80,
      });

      expect(cell(matrix, 'LC')).toBe(350);
      expect(cell(matrix, 'XLC')).toBe(380); // 300 + 80, not 300 + 50 + 80
    });

    it('changing its rule leaves Short and Long Coat exactly as they were', () => {
      const before = deriveGroomingMatrix(300, CONFIG);
      const after = deriveGroomingMatrix(300, {
        ...CONFIG,
        coat_extra_long_rule_type: 'multiplier',
        coat_extra_long_rule_value: 2,
      });

      expect(cell(after, 'SC')).toBe(cell(before, 'SC'));
      expect(cell(after, 'LC')).toBe(cell(before, 'LC'));
      expect(cell(after, 'XLC')).toBe(600); // 300 x 2
    });

    it('a rule copied from Long Coat prices it the same as Long Coat', () => {
      const matrix = deriveGroomingMatrix(300, {
        ...CONFIG,
        coat_extra_long_rule_type: CONFIG.coat_long_rule_type,
        coat_extra_long_rule_value: CONFIG.coat_long_rule_value,
      });

      expect(cell(matrix, 'XLC')).toBe(cell(matrix, 'LC'));
    });
  });

  it('rounds to 2 decimal places', () => {
    const matrix = deriveGroomingMatrix(99.99, {
      ...CONFIG,
      size_s_rule_value: 1.1,
    });

    const smallShortCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
    );

    expect(smallShortCoat?.price).toBe(109.99);
  });

  it('a zero coat_long_rule_value leaves Long Coat equal to Short Coat', () => {
    const matrix = deriveGroomingMatrix(300, {
      ...CONFIG,
      coat_long_rule_value: 0,
    });

    const shortCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
    );
    const longCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'LC'
    );

    expect(longCoat?.price).toBe(shortCoat?.price);
  });

  it('Custom change (configurable pricing rules): a percentage rule adds a percentage of base_price, and a coat multiplier scales the size-adjusted price', () => {
    const matrix = deriveGroomingMatrix(300, {
      ...CONFIG,
      size_s_rule_type: 'percentage',
      size_s_rule_value: 10, // 300 + 10% of 300 = 330
      coat_long_rule_type: 'multiplier',
      coat_long_rule_value: 2, // 330 * 2 = 660
    });

    const shortCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
    );
    const longCoat = matrix.find(
      (cell) => cell.weight_class === 'S' && cell.coat_type === 'LC'
    );

    expect(shortCoat?.price).toBe(330);
    expect(longCoat?.price).toBe(660);
  });
});
