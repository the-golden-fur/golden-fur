import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiscountCategoryScopeSelect } from './DiscountCategoryScopeSelect';

describe('DiscountCategoryScopeSelect', () => {
  it('#85: lists the four service categories', () => {
    render(
      createElement(DiscountCategoryScopeSelect, { value: '', onChange: vi.fn() })
    );

    expect(screen.getByRole('option', { name: 'Grooming' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hotel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Daycare' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Veterinary' })
    ).toBeInTheDocument();
  });

  it('emits the selected category', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(DiscountCategoryScopeSelect, { value: '', onChange })
    );

    await user.selectOptions(screen.getByLabelText('Category'), 'Hotel');

    expect(onChange).toHaveBeenCalledWith('Hotel');
  });
});
