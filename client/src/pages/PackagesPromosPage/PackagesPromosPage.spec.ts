import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PackagesPromosPage } from './PackagesPromosPage';
import { fetchPublicPackagesPromos } from '../../features/public/api/publicCatalog.api';

vi.mock('../../features/public/api/publicCatalog.api', () => ({
  fetchPublicPackagesPromos: vi.fn(),
}));

function renderPage() {
  render(createElement(MemoryRouter, null, createElement(PackagesPromosPage)));
}

describe('PackagesPromosPage', () => {
  it('renders the page heading, a link back home, and empty states once loaded', async () => {
    vi.mocked(fetchPublicPackagesPromos).mockResolvedValue({
      data: { packages: [], promos: [] },
      error: null,
    });

    renderPage();

    expect(
      screen.getByRole('heading', { name: /packages & promos/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute(
      'href',
      '/'
    );

    await waitFor(() =>
      expect(screen.getByText(/no packages available/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/no active promos/i)).toBeInTheDocument();
  });

  it('renders fetched packages and promos from the admin-managed catalog', async () => {
    vi.mocked(fetchPublicPackagesPromos).mockResolvedValue({
      data: {
        packages: [
          {
            id: 'package-1',
            branch_names: ['Makati'],
            name: 'Spa Day',
            bundled_price: 800,
            is_active: true,
            created_by: null,
            updated_by: null,
            created_at: '',
            updated_at: '',
            included_services: [
              {
                id: 'service-1',
                name: 'Bath & Brush',
                category: 'Grooming',
                base_price: 500,
              },
              {
                id: 'service-2',
                name: 'Nail Trim',
                category: 'Grooming',
                base_price: 300,
              },
            ],
            individual_total_price: 800,
            savings: 0,
          },
        ],
        promos: [
          {
            id: 'promo-1',
            name: 'Grand Opening',
            start_date: null,
            end_date: null,
            condition_note: 'New customers only',
            discount_type: 'Percentage',
            value: 20,
            scope_type: 'all_services',
            branch_scope: 'both',
            is_active: true,
            created_by: null,
            updated_by: null,
            created_at: '',
            updated_at: '',
          },
        ],
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Spa Day')).toBeInTheDocument();
    expect(screen.getByText(/Makati/)).toBeInTheDocument();
    expect(screen.getByText('PHP 800.00')).toBeInTheDocument();

    expect(screen.getByText('Grand Opening')).toBeInTheDocument();
    expect(screen.getByText('20% off')).toBeInTheDocument();
    expect(screen.getByText('New customers only')).toBeInTheDocument();
    expect(screen.getByText('Applies to all services')).toBeInTheDocument();
  });

  it('is clickable: opens the package details to reveal its included services', async () => {
    const user = userEvent.setup();

    vi.mocked(fetchPublicPackagesPromos).mockResolvedValue({
      data: {
        packages: [
          {
            id: 'package-1',
            branch_names: ['Makati'],
            name: 'Spa Day',
            bundled_price: 800,
            is_active: true,
            created_by: null,
            updated_by: null,
            created_at: '',
            updated_at: '',
            included_services: [
              {
                id: 'service-1',
                name: 'Bath & Brush',
                category: 'Grooming',
                base_price: 500,
              },
              {
                id: 'service-2',
                name: 'Nail Trim',
                category: 'Grooming',
                base_price: 300,
              },
            ],
            individual_total_price: 800,
            savings: 200,
          },
        ],
        promos: [],
      },
      error: null,
    });

    renderPage();

    const summary = await screen.findByText('Spa Day');
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);

    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Bath & Brush')).toBeInTheDocument();
    expect(screen.getByText('Nail Trim')).toBeInTheDocument();
    expect(screen.getByText(/you save PHP 200.00/i)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetchPublicPackagesPromos).mockResolvedValue({
      data: null,
      error: 'Internal server error',
    });

    renderPage();

    expect(
      await screen.findByText('Internal server error')
    ).toBeInTheDocument();
  });
});
