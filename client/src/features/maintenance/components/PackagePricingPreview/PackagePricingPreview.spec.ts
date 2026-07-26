import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        onSaveDiscount: vi.fn(),
      })
    );

    expect(screen.getByText('PHP 630.00')).toBeInTheDocument();
  });

  it('#83 AC-4: shows a clear empty state for zero included services', () => {
    render(
      createElement(PackagePricingPreview, {
        includedServiceBasePrices: [],
        configuration: CONFIGURATION,
        onSaveDiscount: vi.fn(),
      })
    );

    expect(
      screen.getByText('Add two or more services to see the bundled price.')
    ).toBeInTheDocument();
  });

  it('submits the edited discount percentage as a fraction', async () => {
    const onSaveDiscount = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(PackagePricingPreview, {
        includedServiceBasePrices: [300, 200],
        configuration: CONFIGURATION,
        onSaveDiscount,
      })
    );

    const input = screen.getByLabelText('Bundle discount (%)');
    await user.clear(input);
    await user.type(input, '20');
    await user.click(screen.getByRole('button', { name: 'Save discount %' }));

    expect(onSaveDiscount).toHaveBeenCalledWith(0.2);
  });
});
