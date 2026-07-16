import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ServicePricingTierEditor } from './ServicePricingTierEditor';

describe('ServicePricingTierEditor', () => {
  it('renders one price input per weight x coat cell (4 x 2 = 8)', () => {
    render(
      createElement(ServicePricingTierEditor, { tiers: [], onChange: vi.fn() })
    );

    expect(screen.getAllByRole('spinbutton')).toHaveLength(8);
  });

  it('shows existing tier prices in their cells', () => {
    render(
      createElement(ServicePricingTierEditor, {
        tiers: [{ weight_class: 'M', coat_type: 'LC', price: 450 }],
        onChange: vi.fn(),
      })
    );

    expect(
      screen.getByLabelText('Medium (M) / Long Coat (LC) price')
    ).toHaveValue(450);
  });

  it('emits the edited cell with the rest of the tier set intact', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ServicePricingTierEditor, {
        tiers: [{ weight_class: 'S', coat_type: 'SC', price: 300 }],
        onChange,
      })
    );

    await user.type(
      screen.getByLabelText('Extra Large (XL) / Long Coat (LC) price'),
      '6'
    );

    expect(onChange).toHaveBeenLastCalledWith([
      { weight_class: 'S', coat_type: 'SC', price: 300 },
      { weight_class: 'XL', coat_type: 'LC', price: 6 },
    ]);
  });

  it('removes a cell from the set when its input is cleared', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ServicePricingTierEditor, {
        tiers: [{ weight_class: 'S', coat_type: 'SC', price: 300 }],
        onChange,
      })
    );

    await user.clear(
      screen.getByLabelText('Small (S) / Short Coat (SC) price')
    );

    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
