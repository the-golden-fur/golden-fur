import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../api/maintenance.api';
import type { Package, Promo, Service } from '../../maintenance.types';
import { AdminPromoConfigPage } from './AdminPromoConfigPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServices: vi.fn(),
  listPackages: vi.fn(),
  listPromos: vi.fn(),
  createPromo: vi.fn(),
  updatePromo: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'service-1',
    category: 'Grooming',
    name: 'Bath',
    base_price: 300,
    duration_minutes: null,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    service_pricing_tiers: [],
    service_branch_availability: [],
    ...overrides,
  };
}

function buildPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'package-1',
    branch_id: 'branch-makati',
    name: 'Golden Package',
    bundled_price: 650,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    package_services: [{ service_id: 'service-1' }],
    ...overrides,
  };
}

function buildPromo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: 'promo-1',
    name: 'Summer Sale',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    condition_note: null,
    discount_type: 'Percentage',
    value: 15,
    scope_type: 'all_services',
    branch_scope: 'both',
    is_exclusive: false,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    promo_scope: [],
    ...overrides,
  };
}

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'admin-1',
    branch_id: 'branch-makati',
    role,
    username: 'viewer',
    registered_email: 'viewer@example.com',
    display_name: 'Signed-in Viewer',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'admin-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/promos'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/promos',
            element: createElement(AdminPromoConfigPage),
          }),
          createElement(Route, {
            path: '/staff/profile',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('AdminPromoConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [buildService()],
      error: null,
    });
    vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
      data: [buildPackage()],
      error: null,
    });
    vi.mocked(maintenanceApi.listPromos).mockResolvedValue({
      data: [buildPromo()],
      error: null,
    });
  });

  it('AC-5: redirects a non-Admin/Superadmin role to /staff/profile', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.listPromos).not.toHaveBeenCalled();
  });

  it('AC-1: renders each promo row with name, discount value, and date range', async () => {
    renderPage();

    expect(await screen.findByText('Summer Sale')).toBeInTheDocument();
    expect(screen.getByText('15% off')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01 to 2026-08-31')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('AC-1: branch scope filter narrows the list without navigating', async () => {
    vi.mocked(maintenanceApi.listPromos).mockResolvedValue({
      data: [
        buildPromo(),
        buildPromo({
          id: 'promo-2',
          name: 'Makati Only Deal',
          branch_scope: 'makati',
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Summer Sale')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Branch scope'), 'makati');

    expect(screen.queryByText('Summer Sale')).not.toBeInTheDocument();
    expect(screen.getByText('Makati Only Deal')).toBeInTheDocument();
  });

  it('AC-3: toggling to condition-based hides the date inputs and saves a condition note', async () => {
    vi.mocked(maintenanceApi.createPromo).mockResolvedValue({
      data: buildPromo({
        id: 'promo-new',
        name: 'First Booking Deal',
        start_date: null,
        end_date: null,
        condition_note: 'First booking of the month',
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New promo' }));

    expect(screen.getByLabelText('Start date')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Condition-based' }));

    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'First Booking Deal');
    await user.type(screen.getByLabelText(/Discount value/), '10');
    await user.type(
      screen.getByLabelText('Condition note'),
      'First booking of the month'
    );
    await user.click(screen.getByRole('button', { name: 'Save promo' }));

    await waitFor(() => {
      expect(maintenanceApi.createPromo).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          name: 'First Booking Deal',
          condition_note: 'First booking of the month',
          scope_type: 'all_services',
        })
      );
    });

    const [, payload] = vi.mocked(maintenanceApi.createPromo).mock.calls[0];
    expect(payload).not.toHaveProperty('start_date');
    expect(payload).not.toHaveProperty('end_date');

    expect(await screen.findByText('Promo created.')).toBeInTheDocument();
  });

  it('AC-2: scope_type "all_services" hides the multi-select entirely', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New promo' }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Scope'), 'specific');

    expect(screen.getByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Golden Package')).toBeInTheDocument();
  });

  it('AC-4: the exclusivity toggle saves and displays on the list view', async () => {
    vi.mocked(maintenanceApi.createPromo).mockResolvedValue({
      data: buildPromo({
        id: 'promo-new',
        name: 'Exclusive Deal',
        is_exclusive: true,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New promo' }));
    await user.type(screen.getByLabelText('Name'), 'Exclusive Deal');
    await user.type(screen.getByLabelText(/Discount value/), '20');
    await user.type(screen.getByLabelText('Start date'), '2026-09-01');
    await user.type(screen.getByLabelText('End date'), '2026-09-30');
    await user.click(
      screen.getByRole('switch', {
        name: 'Cannot be combined with other promos',
      })
    );
    await user.click(screen.getByRole('button', { name: 'Save promo' }));

    await waitFor(() => {
      expect(maintenanceApi.createPromo).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ is_exclusive: true })
      );
    });

    expect(await screen.findByText('Exclusive')).toBeInTheDocument();
  });

  it('AC-2: editing an existing promo updates it in place', async () => {
    vi.mocked(maintenanceApi.updatePromo).mockResolvedValue({
      data: buildPromo({ value: 25 }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    const valueInput = screen.getByLabelText(/Discount value/);
    await user.clear(valueInput);
    await user.type(valueInput, '25');
    await user.click(screen.getByRole('button', { name: 'Save promo' }));

    await waitFor(() => {
      expect(maintenanceApi.updatePromo).toHaveBeenCalledWith(
        'promo-1',
        'token',
        expect.objectContaining({ value: 25 })
      );
    });

    expect(await screen.findByText('25% off')).toBeInTheDocument();
  });
});
