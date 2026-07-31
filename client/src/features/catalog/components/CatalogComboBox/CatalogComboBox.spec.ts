import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogComboBox } from './CatalogComboBox';

const ITEMS = [
  { id: 'food-1', name: 'Dry kibble', price: 50 },
  { id: 'food-2', name: 'Wet food', price: 75 },
];

describe('CatalogComboBox', () => {
  it('selecting an option sets catalogId and the matching name', () => {
    const onChange = vi.fn();
    render(
      createElement(CatalogComboBox, {
        items: ITEMS,
        value: { catalogId: null, text: '' },
        onChange,
      })
    );

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Dry kibble'));

    expect(onChange).toHaveBeenCalledWith({
      catalogId: 'food-1',
      text: 'Dry kibble',
    });
  });

  it('typing a value with no catalog match keeps catalogId null (freetext)', () => {
    const onChange = vi.fn();
    render(
      createElement(CatalogComboBox, {
        items: ITEMS,
        value: { catalogId: null, text: '' },
        onChange,
      })
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Owner's own mix" } });

    expect(onChange).toHaveBeenLastCalledWith({
      catalogId: null,
      text: "Owner's own mix",
    });
    expect(screen.getByText(/No catalog match/)).toBeInTheDocument();
  });

  it('re-typing after a catalog selection clears the prior catalogId', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      createElement(CatalogComboBox, {
        items: ITEMS,
        value: { catalogId: 'food-1', text: 'Dry kibble' },
        onChange,
      })
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    rerender(
      createElement(CatalogComboBox, {
        items: ITEMS,
        value: { catalogId: 'food-1', text: 'Dry kibble' },
        onChange,
      })
    );
    fireEvent.change(input, { target: { value: 'Dry kibble XL' } });

    expect(onChange).toHaveBeenLastCalledWith({
      catalogId: null,
      text: 'Dry kibble XL',
    });
  });
});
