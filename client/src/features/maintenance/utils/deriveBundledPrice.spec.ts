import { describe, expect, it } from 'vitest';
import { deriveBundledPrice } from './deriveBundledPrice';
import type { PackagePricingConfiguration } from '../maintenance.types';

const CONFIG: PackagePricingConfiguration = {
  id: 'package-pricing-1',
  bundle_discount_percentage: 0.1,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

describe('deriveBundledPrice', () => {
  it('#83: sums included services then applies the configured discount', () => {
    expect(deriveBundledPrice([300, 200, 200], CONFIG)).toBe(630);
  });

  it('#83 AC-4: an empty service list derives to 0, not an error', () => {
    expect(deriveBundledPrice([], CONFIG)).toBe(0);
  });
});
