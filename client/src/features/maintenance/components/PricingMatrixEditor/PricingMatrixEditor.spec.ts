import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PricingMatrixEditor } from './PricingMatrixEditor';
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

function renderEditor(
  props: Partial<Parameters<typeof PricingMatrixEditor>[0]> = {}
) {
  const onChange = vi.fn();
  render(
    createElement(PricingMatrixEditor, {
      basePrice: 300,
      configuration: CONFIGURATION,
      drafts: {},
      onChange,
      ...props,
    })
  );
  return { onChange };
}

describe('PricingMatrixEditor', () => {
  it("starts every cell at the formula's price", () => {
    renderEditor();

    expect(screen.getByLabelText('Small (S), short coat price')).toHaveValue(
      300
    );
    // L = 300 x 1.25 = 375, + 50 for a long coat.
    expect(screen.getByLabelText('Large (L), long coat price')).toHaveValue(
      425
    );
    expect(screen.getAllByText('Formula')).toHaveLength(8);
  });

  it('typing over a cell makes it the item’s own price', () => {
    const { onChange } = renderEditor();

    fireEvent.change(screen.getByLabelText('Large (L), long coat price'), {
      target: { value: '650' },
    });

    expect(onChange).toHaveBeenCalledWith({ 'L:LC': '650' });
  });

  it('shows an own price and puts it back on the formula', async () => {
    const { onChange } = renderEditor({ drafts: { 'L:LC': '650' } });

    expect(screen.getByLabelText('Large (L), long coat price')).toHaveValue(
      650
    );
    expect(screen.getByText('Own price')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use the formula price for Large (L), long coat price',
      })
    );

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('read-only shows the prices without inputs or reset buttons', () => {
    renderEditor({ drafts: { 'L:LC': '650' }, readOnly: true });

    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Large (L), long coat price')
    ).toHaveTextContent('₱650.00');
    expect(
      screen.getByText('Only a Superadmin can change these prices.')
    ).toBeInTheDocument();
  });
});
