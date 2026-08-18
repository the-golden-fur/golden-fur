import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import type { Package, Service } from '../../../maintenance/maintenance.types';
import * as discountsApi from '../../api/discounts.api';
import type { Discount } from '../../discounts.types';
import { AdminDiscountManagementPage } from './AdminDiscountManagementPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServices: vi.fn(),
  listPackages: vi.fn(),
}));

vi.mock('../../api/discounts.api', () => ({
  listDiscounts: vi.fn(),
  createDiscount: vi.fn(),
  updateDiscount: vi.fn(),
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
    name: 'Golden Package',
    bundled_price: 650,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    package_services: [],
    package_branch_availability: [
      {
        package_id: 'package-1',
        branch_id: 'branch-makati',
        is_available: true,
      },
    ],
    ...overrides,
  };
}

function buildDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'discount-1',
    branch_id: 'branch-makati',
    name: 'Senior Citizen',
    is_mandated: true,
    discount_type: 'Percentage',
    value: 20,
    scope_type: 'category',
    scope_service_id: null,
    scope_package_id: null,
    scope_category: 'Grooming',
    is_active: false,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
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
      { initialEntries: ['/staff/admin/discounts'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/discounts',
            element: createElement(AdminDiscountManagementPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('AdminDiscountManagementPage', () => {
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
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        buildDiscount(),
        buildDiscount({
          id: 'discount-2',
          name: 'PWD',
          scope_category: 'Veterinary',
        }),
      ],
      error: null,
    });
  });

  it('AC-5: redirects a non-Admin/Superadmin role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(discountsApi.listDiscounts).not.toHaveBeenCalled();
  });

  it('AC-1: shows Senior Citizen and PWD in a distinct Government-Mandated section, both Inactive by default', async () => {
    renderPage();

    expect(await screen.findByText('Government-Mandated')).toBeInTheDocument();
    expect(screen.getByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();
    expect(screen.getAllByText('Inactive')).toHaveLength(2);
    expect(screen.getByText('Custom Discounts')).toBeInTheDocument();
    expect(
      screen.getByText('No custom discounts match the selected filters.')
    ).toBeInTheDocument();
  });

  it('AC-2: the enable/disable toggle activates a discount without a full page reload', async () => {
    vi.mocked(discountsApi.updateDiscount).mockResolvedValue({
      data: buildDiscount({ is_active: true }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      (await screen.findAllByRole('switch', { name: /Senior Citizen/ }))[0]
    );

    await waitFor(() => {
      expect(discountsApi.updateDiscount).toHaveBeenCalledWith(
        'discount-1',
        'token',
        { is_active: true }
      );
    });

    expect(await screen.findAllByText('Active')).toHaveLength(1);
  });

  it('AC-3: create-custom-discount form saves name, type, value, and category scope for a branch', async () => {
    vi.mocked(discountsApi.createDiscount).mockResolvedValue({
      data: buildDiscount({
        id: 'discount-new',
        name: 'Staff Appreciation',
        is_mandated: false,
        value: 10,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New custom discount' })
    );

    // Two "Branch" selects exist (filter + form) - the form's is second.
    await user.selectOptions(
      screen.getAllByLabelText('Branch')[1],
      'branch-makati'
    );
    await user.type(screen.getByLabelText('Name'), 'Staff Appreciation');
    await user.type(screen.getByLabelText(/Discount value/), '10');
    await user.selectOptions(screen.getByLabelText('Scope'), 'category');
    await user.selectOptions(screen.getByLabelText('Category'), 'Grooming');
    await user.click(screen.getByRole('button', { name: 'Save discount' }));

    await waitFor(() => {
      expect(discountsApi.createDiscount).toHaveBeenCalledWith('token', {
        branch_id: 'branch-makati',
        name: 'Staff Appreciation',
        discount_type: 'Percentage',
        value: 10,
        scope_type: 'category',
        scope_category: 'Grooming',
      });
    });

    expect(await screen.findByText('Discount created.')).toBeInTheDocument();
  });

  it("AC-4: a mandated discount's name field is read-only in the edit form", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(
      (await screen.findAllByRole('button', { name: 'Edit' }))[0]
    );

    expect(screen.getByLabelText('Name')).toBeDisabled();
  });

  it('Epic B #85 AC-1: renders discounts as cards, not table rows', async () => {
    renderPage();

    expect(await screen.findByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });

  it('#85 AC-2: search narrows the visible cards by name', async () => {
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search'), 'pwd');

    expect(screen.queryByText('Senior Citizen')).not.toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();
  });

  it('#85 AC-3: the scope-type filter narrows to Category', async () => {
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        buildDiscount(),
        buildDiscount({
          id: 'discount-3',
          name: 'Custom Service Discount',
          is_mandated: false,
          scope_type: 'service',
          scope_category: null,
          scope_service_id: 'service-1',
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.getByText('Custom Service Discount')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Scope type'), 'category');

    expect(screen.getByText('Senior Citizen')).toBeInTheDocument();
    expect(
      screen.queryByText('Custom Service Discount')
    ).not.toBeInTheDocument();
  });

  it('#85 AC-5: existing Service- and Package-scoped discounts still display and function', async () => {
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        buildDiscount({
          id: 'discount-service',
          name: 'Service Scoped',
          is_mandated: false,
          scope_type: 'service',
          scope_category: null,
          scope_service_id: 'service-1',
        }),
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Service Scoped')).toBeInTheDocument();
    expect(screen.getByText('Service: Bath')).toBeInTheDocument();
  });
});
