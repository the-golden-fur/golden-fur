import { describe, expect, it } from 'vitest';
import { deriveGroomingMatrix } from './deriveGroomingMatrix';
import type { PricingConfiguration } from '../maintenance.types';

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
    expect(
      matrix.find(
        (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
      )?.price
    ).toBe(300);
    expect(
      matrix.find(
        (cell) => cell.weight_class === 'S' && cell.coat_type === 'LC'
      )?.price
    ).toBe(350);
    expect(
      matrix.find(
        (cell) => cell.weight_class === 'XL' && cell.coat_type === 'LC'
      )?.price
    ).toBe(500);
  });

  // Custom change (Extra Long Coat): must match the server's copy of this
  // formula exactly.
  describe('Extra Long Coat', () => {
    function smallCell(
      matrix: ReturnType<typeof deriveGroomingMatrix>,
      coatType: string
    ) {
      return matrix.find(
        (cell) => cell.weight_class === 'S' && cell.coat_type === coatType
      )?.price;
    }

    it('uses its own rule in place of the Long Coat one - the two never stack', () => {
      const matrix = deriveGroomingMatrix(300, CONFIG);

      expect(smallCell(matrix, 'LC')).toBe(350); // 300 + 50
      expect(smallCell(matrix, 'XLC')).toBe(420); // 300 + 120, not + 50 + 120
    });

    it('scales the size-adjusted price when its rule is a multiplier, leaving the other coats alone', () => {
      const matrix = deriveGroomingMatrix(300, {
        ...CONFIG,
        coat_extra_long_rule_type: 'multiplier',
        coat_extra_long_rule_value: 2,
      });

      expect(smallCell(matrix, 'SC')).toBe(300);
      expect(smallCell(matrix, 'LC')).toBe(350);
      expect(smallCell(matrix, 'XLC')).toBe(600);
    });
  });

  it('a base_price of 0 (not-yet-entered form field) derives all zeros plus the flat add-on', () => {
    const matrix = deriveGroomingMatrix(0, CONFIG);

    expect(
      matrix.find(
        (cell) => cell.weight_class === 'S' && cell.coat_type === 'SC'
      )?.price
    ).toBe(0);
    expect(
      matrix.find(
        (cell) => cell.weight_class === 'S' && cell.coat_type === 'LC'
      )?.price
    ).toBe(50);
  });
});
