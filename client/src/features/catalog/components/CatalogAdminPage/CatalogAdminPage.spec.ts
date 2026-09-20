import { fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { CatalogAdminPage } from './CatalogAdminPage';

const ITEM = {
  id: 'item-1',
  name: 'Dry kibble',
  category: 'food',
  service_scope: 'hotel',
  price: 50,
  is_active: true,
};

function buildProps(
  overrides: Partial<Parameters<typeof CatalogAdminPage>[0]> = {}
) {
  return {
    title: 'Product Catalog',
    itemNoun: 'product',
    accessToken: 'token',
    listItems: vi.fn().mockResolvedValue({ data: [ITEM], error: null }),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    archiveItem: vi.fn(),
    archiveTab: 'products',
    ...overrides,
  };
}

function renderWithRouter(props: ReturnType<typeof buildProps>) {
  return render(
    createElement(MemoryRouter, null, createElement(CatalogAdminPage, props))
  );
}

describe('CatalogAdminPage', () => {
  it('lists existing items with their price and category', async () => {
    renderWithRouter(buildProps());

    expect(await screen.findByText('Dry kibble')).toBeInTheDocument();
    expect(screen.getByText('PHP 50.00')).toBeInTheDocument();
    // 'food' appears both as the category badge and as a filter-dropdown
    // option, so assert presence rather than a single unique match.
    expect(screen.getAllByText('food').length).toBeGreaterThan(0);
  });

  it('submitting the add form calls createItem with the entered name/category/service_scope/price', async () => {
    const createItem = vi.fn().mockResolvedValue({
      data: { ...ITEM, id: 'item-2', name: 'Wet food', price: 75 },
      error: null,
    });
    renderWithRouter(
      buildProps({
        listItems: vi.fn().mockResolvedValue({ data: [], error: null }),
        createItem,
      })
    );

    await screen.findByText('No product items match this filter.');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));

    const dialog = screen.getByRole('dialog', { name: 'Add product' });
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Wet food' },
    });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'food' },
    });
    fireEvent.change(within(dialog).getByLabelText('Service scope'), {
      target: { value: 'hotel' },
    });
    fireEvent.change(within(dialog).getByLabelText('Price (PHP)'), {
      target: { value: '75' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add product' })
    );

    await screen.findByText('Wet food');
    expect(createItem).toHaveBeenCalledWith(
      { name: 'Wet food', category: 'food', service_scope: 'hotel', price: 75 },
      'token'
    );
    // The modal closes on success - the form no longer sits on the page.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Deactivate calls updateItem with is_active: false', async () => {
    const updateItem = vi
      .fn()
      .mockResolvedValue({ data: { ...ITEM, is_active: false }, error: null });
    renderWithRouter(buildProps({ updateItem }));

    fireEvent.click(await screen.findByText('Deactivate'));

    expect(updateItem).toHaveBeenCalledWith(
      'item-1',
      { is_active: false },
      'token'
    );
    expect(await screen.findByText('Inactive')).toBeInTheDocument();
  });

  it('Archive is hidden while the item is still active', async () => {
    renderWithRouter(buildProps());

    await screen.findByText('Dry kibble');
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });

  it('Archive removes the item from the list once deactivated', async () => {
    const archiveItem = vi.fn().mockResolvedValue({ data: null, error: null });
    renderWithRouter(
      buildProps({
        listItems: vi.fn().mockResolvedValue({
          data: [{ ...ITEM, is_active: false }],
          error: null,
        }),
        archiveItem,
      })
    );

    fireEvent.click(await screen.findByText('Archive'));

    expect(archiveItem).toHaveBeenCalledWith('item-1', 'token');
    expect(
      await screen.findByText('No product items match this filter.')
    ).toBeInTheDocument();
  });

  it('searching narrows the visible items by name or category', async () => {
    renderWithRouter(
      buildProps({
        listItems: vi.fn().mockResolvedValue({
          data: [
            ITEM,
            { ...ITEM, id: 'item-2', name: 'Wet food', category: 'wet' },
          ],
          error: null,
        }),
      })
    );

    await screen.findByText('Dry kibble');
    expect(screen.getByText('Wet food')).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('Search products by name or category...'),
      { target: { value: 'dry' } }
    );

    expect(screen.getByText('Dry kibble')).toBeInTheDocument();
    expect(screen.queryByText('Wet food')).not.toBeInTheDocument();
  });

  it('switches to Board view, grouped by Category by default', async () => {
    const { container } = renderWithRouter(
      buildProps({
        listItems: vi.fn().mockResolvedValue({
          data: [
            ITEM,
            { ...ITEM, id: 'item-2', name: 'Wet food', category: 'wet' },
          ],
          error: null,
        }),
      })
    );

    await screen.findByText('Dry kibble');

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));

    // One column per category (food, wet).
    expect(
      container.querySelectorAll('section:not([aria-labelledby])')
    ).toHaveLength(2);
    expect(screen.getByText('Dry kibble')).toBeInTheDocument();
    expect(screen.getByText('Wet food')).toBeInTheDocument();
  });
});
