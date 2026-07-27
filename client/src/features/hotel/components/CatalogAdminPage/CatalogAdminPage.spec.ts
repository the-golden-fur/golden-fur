import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogAdminPage } from './CatalogAdminPage';

const ITEM = { id: 'item-1', name: 'Dry kibble', price: 50, is_active: true };

function buildProps(
  overrides: Partial<Parameters<typeof CatalogAdminPage>[0]> = {}
) {
  return {
    title: 'Food Catalog',
    itemNoun: 'food item',
    accessToken: 'token',
    listItems: vi.fn().mockResolvedValue({ data: [ITEM], error: null }),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    ...overrides,
  };
}

describe('CatalogAdminPage', () => {
  it('lists existing items with their price', async () => {
    render(createElement(CatalogAdminPage, buildProps()));

    expect(await screen.findByText('Dry kibble')).toBeInTheDocument();
    expect(screen.getByText('PHP 50.00')).toBeInTheDocument();
  });

  it('submitting the add form calls createItem with the entered name/price', async () => {
    const createItem = vi.fn().mockResolvedValue({
      data: { ...ITEM, id: 'item-2', name: 'Wet food', price: 75 },
      error: null,
    });
    render(
      createElement(
        CatalogAdminPage,
        buildProps({
          listItems: vi.fn().mockResolvedValue({ data: [], error: null }),
          createItem,
        })
      )
    );

    await screen.findByText('No food item items yet.');

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Wet food' },
    });
    fireEvent.change(screen.getByLabelText('Price (PHP)'), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add food item' }));

    await screen.findByText('Wet food');
    expect(createItem).toHaveBeenCalledWith(
      { name: 'Wet food', price: 75 },
      'token'
    );
  });

  it('Deactivate calls updateItem with is_active: false', async () => {
    const updateItem = vi
      .fn()
      .mockResolvedValue({ data: { ...ITEM, is_active: false }, error: null });
    render(createElement(CatalogAdminPage, buildProps({ updateItem })));

    fireEvent.click(await screen.findByText('Deactivate'));

    expect(updateItem).toHaveBeenCalledWith(
      'item-1',
      { is_active: false },
      'token'
    );
    expect(await screen.findByText('Inactive')).toBeInTheDocument();
  });

  it('Delete removes the item from the list on success', async () => {
    const deleteItem = vi.fn().mockResolvedValue({ data: null, error: null });
    render(createElement(CatalogAdminPage, buildProps({ deleteItem })));

    fireEvent.click(await screen.findByText('Delete'));

    expect(deleteItem).toHaveBeenCalledWith('item-1', 'token');
    expect(
      await screen.findByText('No food item items yet.')
    ).toBeInTheDocument();
  });
});
