import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PricingMatrixPreview } from './PricingMatrixPreview';
import type { PricingConfiguration } from '../../maintenance.types';

const CONFIGURATION: PricingConfiguration = {
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

describe('PricingMatrixPreview', () => {
  it('#81: renders all 8 derived cells, read-only', () => {
    render(
      createElement(PricingMatrixPreview, {
        basePrice: 300,
        configuration: CONFIGURATION,
      })
    );

    expect(screen.getByText('PHP 300.00')).toBeInTheDocument();
    expect(screen.getByText('PHP 350.00')).toBeInTheDocument();
    expect(screen.getByText('PHP 500.00')).toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('recomputes when base_price changes', () => {
    const { rerender } = render(
      createElement(PricingMatrixPreview, {
        basePrice: 100,
        configuration: CONFIGURATION,
      })
    );

    expect(screen.getByText('PHP 100.00')).toBeInTheDocument();

    rerender(
      createElement(PricingMatrixPreview, {
        basePrice: 200,
        configuration: CONFIGURATION,
      })
    );

    expect(screen.getByText('PHP 200.00')).toBeInTheDocument();
  });
});
