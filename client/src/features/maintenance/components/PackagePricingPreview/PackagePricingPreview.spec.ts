import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PackagePricingPreview } from './PackagePricingPreview';
import type { PackagePricingConfiguration } from '../../maintenance.types';

const CONFIGURATION: PackagePricingConfiguration = {
  id: 'package-pricing-1',
  bundle_discount_percentage: 0.1,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

describe('PackagePricingPreview', () => {
  it('#83: derives and displays the bundled price from included services', () => {
    render(
      createElement(PackagePricingPreview, {
        includedServiceBasePrices: [300, 200, 200],
        configuration: CONFIGURATION,
        discountPercentInput: '10',
        onDiscountPercentInputChange: vi.fn(),
      })
    );

    expect(screen.getByText('PHP 630.00')).toBeInTheDocument();
  });

  it('#83 AC-4: shows a clear empty state for zero included services', () => {
    render(
      createElement(PackagePricingPreview, {
        includedServiceBasePrices: [],
        configuration: CONFIGURATION,
        discountPercentInput: '10',
        onDiscountPercentInputChange: vi.fn(),
      })
    );

    expect(
      screen.getByText('Add two or more services to see the bundled price.')
    ).toBeInTheDocument();
  });

  it('recalculates the preview live as the discount input changes, without saving anything itself', () => {
    const onDiscountPercentInputChange = vi.fn();

    const { rerender } = render(
      createElement(PackagePricingPreview, {
        includedServiceBasePrices: [300, 200],
        configuration: CONFIGURATION,
        discountPercentInput: '10',
        onDiscountPercentInputChange,
      })
    );

    expect(screen.getByText('PHP 450.00')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save discount %' })
    ).not.toBeInTheDocument();

    // fireEvent.change fires a single change event with the full new value
    // - this is a controlled input (value comes from the discountPercentInput
    // prop), so simulating keystroke-by-keystroke typing against a prop this
    // test doesn't update in between would type against a stale value.
    const input = screen.getByLabelText('Bundle discount (%)');
    fireEvent.change(input, { target: { value: '20' } });

    expect(onDiscountPercentInputChange).toHaveBeenLastCalledWith('20');

    rerender(
      createElement(PackagePricingPreview, {
        includedServiceBasePrices: [300, 200],
        configuration: CONFIGURATION,
        discountPercentInput: '20',
        onDiscountPercentInputChange,
      })
    );

    expect(screen.getByText('PHP 400.00')).toBeInTheDocument();
  });
});
