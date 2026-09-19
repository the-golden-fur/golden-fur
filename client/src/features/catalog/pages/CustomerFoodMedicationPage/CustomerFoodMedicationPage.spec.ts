import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as catalogApi from '../../api/catalog.api';
import type { ProductCatalogItem } from '../../catalog.types';
import { CustomerFoodMedicationPage } from './CustomerFoodMedicationPage';

vi.mock('../../api/catalog.api', () => ({
  listCustomerCatalog: vi.fn(),
  createCustomerCatalogItem: vi.fn(),
  updateCustomerCatalogItem: vi.fn(),
  archiveCustomerCatalogItem: vi.fn(),
}));

function buildItem(
  overrides: Partial<ProductCatalogItem> = {}
): ProductCatalogItem {
  return {
    id: 'item-1',
    name: 'Chicken kibble',
    category: 'food',
    service_scope: 'hotel',
    price: 0,
    is_active: true,
    archived_at: null,
    created_at: '',
    updated_at: '',
    owner_customer_id: 'customer-1',
    ...overrides,
  } as ProductCatalogItem;
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'customer@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(CustomerFoodMedicationPage)
      )
    )
  );
}

describe('CustomerFoodMedicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists food and medication types in one combined table', async () => {
    vi.mocked(catalogApi.listCustomerCatalog).mockResolvedValue({
      data: [
        buildItem({ id: '1', name: 'Chicken kibble', category: 'food' }),
        buildItem({ id: '2', name: 'Amoxicillin', category: 'medication' }),
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Chicken kibble')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
  });

  it('renames an item via the "..." menu', async () => {
    vi.mocked(catalogApi.listCustomerCatalog).mockResolvedValue({
      data: [buildItem()],
      error: null,
    });
    vi.mocked(catalogApi.updateCustomerCatalogItem).mockResolvedValue({
      data: buildItem({ name: 'Chicken kibble (grain-free)' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chicken kibble');
    await user.click(
      screen.getByRole('button', { name: 'Actions for Chicken kibble' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const nameInput = screen.getByDisplayValue('Chicken kibble');
    await user.clear(nameInput);
    await user.type(nameInput, 'Chicken kibble (grain-free)');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(catalogApi.updateCustomerCatalogItem).toHaveBeenCalledWith(
        'item-1',
        'Chicken kibble (grain-free)',
        'token'
      )
    );
  });

  it('removes an item via the "..." menu', async () => {
    vi.mocked(catalogApi.listCustomerCatalog).mockResolvedValue({
      data: [buildItem()],
      error: null,
    });
    vi.mocked(catalogApi.archiveCustomerCatalogItem).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chicken kibble');
    await user.click(
      screen.getByRole('button', { name: 'Actions for Chicken kibble' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));

    await waitFor(() =>
      expect(catalogApi.archiveCustomerCatalogItem).toHaveBeenCalledWith(
        'item-1',
        'token'
      )
    );
    expect(screen.queryByText('Chicken kibble')).not.toBeInTheDocument();
  });

  it('adds a new type from the Add a new type form', async () => {
    vi.mocked(catalogApi.listCustomerCatalog).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(catalogApi.createCustomerCatalogItem).mockResolvedValue({
      data: buildItem({ id: 'item-new', name: 'Salmon oil' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Add a new type');
    await user.type(
      screen.getByPlaceholderText('e.g. Chicken kibble, Amoxicillin'),
      'Salmon oil'
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(catalogApi.createCustomerCatalogItem).toHaveBeenCalledWith(
        { name: 'Salmon oil', category: 'food' },
        'token'
      )
    );
    expect(await screen.findByText('Salmon oil')).toBeInTheDocument();
  });

  it('a Category filter tile narrows the list', async () => {
    vi.mocked(catalogApi.listCustomerCatalog).mockResolvedValue({
      data: [
        buildItem({ id: '1', name: 'Chicken kibble', category: 'food' }),
        buildItem({ id: '2', name: 'Amoxicillin', category: 'medication' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chicken kibble');
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();

    // Category defaults to Food.
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Category' }));

    expect(screen.getByText('Chicken kibble')).toBeInTheDocument();
    expect(screen.queryByText('Amoxicillin')).not.toBeInTheDocument();
  });

  it('switches to Board view, grouped by Category', async () => {
    vi.mocked(catalogApi.listCustomerCatalog).mockResolvedValue({
      data: [
        buildItem({ id: '1', name: 'Chicken kibble', category: 'food' }),
        buildItem({ id: '2', name: 'Amoxicillin', category: 'medication' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    const { container } = renderPage();

    await screen.findByText('Chicken kibble');
    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(container.querySelectorAll('section[class*="column"]')).toHaveLength(
      2
    );
    expect(screen.getByText(/Chicken kibble/)).toBeInTheDocument();
    expect(screen.getByText(/Amoxicillin/)).toBeInTheDocument();
  });
});
