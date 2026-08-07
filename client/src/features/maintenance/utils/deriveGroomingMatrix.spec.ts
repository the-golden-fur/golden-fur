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
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

describe('deriveGroomingMatrix', () => {
  it('#81: derives all 8 cells from base_price and the shared multipliers', () => {
    const matrix = deriveGroomingMatrix(300, CONFIG);

    expect(matrix).toHaveLength(8);
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
