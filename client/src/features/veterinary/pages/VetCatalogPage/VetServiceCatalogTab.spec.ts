import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vetApi from '../../api/veterinary.api';
import type { VetServiceCatalogItem } from '../../veterinary.types';
import { VetServiceCatalogTab } from './VetServiceCatalogTab';

vi.mock('../../api/veterinary.api', () => ({
  listServiceCatalog: vi.fn(),
  createServiceCatalogItem: vi.fn(),
  updateServiceCatalogItem: vi.fn(),
  deleteServiceCatalogItem: vi.fn(),
}));

function buildService(
  overrides: Partial<VetServiceCatalogItem> = {}
): VetServiceCatalogItem {
  return {
    id: 'svc-1',
    name: 'Major Surgery',
    default_price: 10000,
    created_by: 'vet-2',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderTab(services: VetServiceCatalogItem[] = []) {
  vi.mocked(vetApi.listServiceCatalog).mockResolvedValue({
    data: services,
    error: null,
  });

  render(createElement(VetServiceCatalogTab, { accessToken: 'token' }));
}

describe('VetServiceCatalogTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the shared services with their usual prices, in name order', async () => {
    renderTab([
      buildService(),
      buildService({ id: 'svc-2', name: 'Deworming', default_price: 350 }),
    ]);

    const rows = await screen.findAllByRole('row');
    // Header row first, then the services A-Z.
    expect(within(rows[1]).getByText('Deworming')).toBeInTheDocument();
    expect(within(rows[1]).getByText('₱350.00')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Major Surgery')).toBeInTheDocument();
    expect(within(rows[2]).getByText('₱10,000.00')).toBeInTheDocument();
  });

  it('says so when the list is empty', async () => {
    renderTab([]);

    expect(
      await screen.findByText(/No services on the list yet/)
    ).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    vi.mocked(vetApi.listServiceCatalog).mockResolvedValue({
      data: null,
      error: 'Forbidden',
    });

    render(createElement(VetServiceCatalogTab, { accessToken: 'token' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
  });

  it('adds a service with its usual price', async () => {
    renderTab([]);
    vi.mocked(vetApi.createServiceCatalogItem).mockResolvedValue({
      data: buildService({ id: 'svc-9', name: 'X-ray', default_price: 1200 }),
      error: null,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add service' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Add service' });
    await userEvent.type(
      within(dialog).getByLabelText('Service name'),
      'X-ray'
    );
    await userEvent.type(
      within(dialog).getByLabelText('Usual price (₱)'),
      '1200'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vetApi.createServiceCatalogItem).toHaveBeenCalledWith('token', {
        name: 'X-ray',
        default_price: 1200,
      })
    );
    expect(await screen.findByText('X-ray')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('will not save a service without a name or a price', async () => {
    renderTab([]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add service' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Add service' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    expect(vetApi.createServiceCatalogItem).not.toHaveBeenCalled();
  });

  it("edits a service's price", async () => {
    renderTab([buildService()]);
    vi.mocked(vetApi.updateServiceCatalogItem).mockResolvedValue({
      data: buildService({ default_price: 12000 }),
      error: null,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Major Surgery' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit service' });
    const price = within(dialog).getByLabelText('Usual price (₱)');
    expect(price).toHaveValue(10000);
    await userEvent.clear(price);
    await userEvent.type(price, '12000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vetApi.updateServiceCatalogItem).toHaveBeenCalledWith(
        'svc-1',
        'token',
        { name: 'Major Surgery', default_price: 12000 }
      )
    );
    expect(await screen.findByText('₱12,000.00')).toBeInTheDocument();
  });

  it('removes a service from the list', async () => {
    renderTab([buildService()]);
    vi.mocked(vetApi.deleteServiceCatalogItem).mockResolvedValue({
      data: null,
      error: null,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete Major Surgery' })
    );

    await waitFor(() =>
      expect(vetApi.deleteServiceCatalogItem).toHaveBeenCalledWith(
        'svc-1',
        'token'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Major Surgery')).not.toBeInTheDocument()
    );
  });

  it('keeps the form open with the reason when the server refuses a save', async () => {
    renderTab([]);
    vi.mocked(vetApi.createServiceCatalogItem).mockResolvedValue({
      data: null,
      error: 'Invalid payload',
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add service' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Add service' });
    await userEvent.type(
      within(dialog).getByLabelText('Service name'),
      'X-ray'
    );
    await userEvent.type(
      within(dialog).getByLabelText('Usual price (₱)'),
      '1200'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Invalid payload'
    );
  });
});
