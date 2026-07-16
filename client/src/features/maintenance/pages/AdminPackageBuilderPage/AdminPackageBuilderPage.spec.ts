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
import type { Package, Service } from '../../maintenance.types';
import { AdminPackageBuilderPage } from './AdminPackageBuilderPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServices: vi.fn(),
  listPackages: vi.fn(),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
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
    service_branch_availability: [
      {
        service_id: 'service-1',
        branch_id: 'branch-makati',
        is_available: true,
      },
      {
        service_id: 'service-1',
        branch_id: 'branch-southwoods',
        is_available: true,
      },
    ],
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
    package_services: [
      { service_id: 'service-1' },
      { service_id: 'service-2' },
      { service_id: 'service-3' },
    ],
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
      { initialEntries: ['/staff/admin/maintenance/packages'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/packages',
            element: createElement(AdminPackageBuilderPage),
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

describe('AdminPackageBuilderPage', () => {
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
      data: [
        buildService(),
        buildService({ id: 'service-2', name: 'Blow-dry' }),
        buildService({
          id: 'service-3',
          name: 'Brushing',
          // Makati-only: must not be offered in a Southwoods package.
          service_branch_availability: [
            {
              service_id: 'service-3',
              branch_id: 'branch-makati',
              is_available: true,
            },
          ],
        }),
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
      data: [buildPackage()],
      error: null,
    });
  });

  it('AC-4: redirects a non-Admin/Superadmin role to /staff/profile', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.listPackages).not.toHaveBeenCalled();
  });

  it('AC-1: renders each package row with name, branch, service count, price, and status badge', async () => {
    renderPage();

    expect(await screen.findByText('Golden Package')).toBeInTheDocument();
    // selector-scoped: 'Makati' also appears as a filter <option>.
    expect(screen.getByText('Makati', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('3 services')).toBeInTheDocument();
    expect(screen.getByText('PHP 650.00')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('AC-1: branch filter narrows the list without navigating', async () => {
    vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
      data: [
        buildPackage(),
        buildPackage({
          id: 'package-2',
          branch_id: 'branch-southwoods',
          name: 'Southwoods Combo',
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Golden Package')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('Branch'),
      'branch-southwoods'
    );

    expect(screen.queryByText('Golden Package')).not.toBeInTheDocument();
    expect(screen.getByText('Southwoods Combo')).toBeInTheDocument();
  });

  it('AC-2: builder requires a branch before listing services, then creates the package', async () => {
    vi.mocked(maintenanceApi.createPackage).mockResolvedValue({
      data: buildPackage({ id: 'package-new', name: 'Fresh Coat Bundle' }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New package' })
    );

    // No branch chosen yet: the service list stays hidden.
    expect(
      screen.getByText('Select a branch to pick its available services.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    // Two "Branch" selects exist (filter + form) - the form's is second.
    await user.selectOptions(
      screen.getAllByLabelText('Branch')[1],
      'branch-southwoods'
    );

    // Brushing is Makati-only, so it is not offered for a Southwoods package.
    expect(screen.getByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Blow-dry')).toBeInTheDocument();
    expect(screen.queryByText('Brushing')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Package name'), 'Fresh Coat Bundle');
    await user.type(
      screen.getByLabelText(/Bundled price/),
      '999'
    );
    await user.click(screen.getByRole('checkbox', { name: /Bath/ }));
    await user.click(screen.getByRole('checkbox', { name: /Blow-dry/ }));
    await user.click(screen.getByRole('button', { name: 'Save package' }));

    await waitFor(() => {
      expect(maintenanceApi.createPackage).toHaveBeenCalledWith('token', {
        branch_id: 'branch-southwoods',
        name: 'Fresh Coat Bundle',
        bundled_price: 999,
        service_ids: ['service-1', 'service-2'],
      });
    });

    expect(await screen.findByText('Package created.')).toBeInTheDocument();
  });

  it('AC-2: the bundled price is not validated against the sum of selected services', async () => {
    vi.mocked(maintenanceApi.createPackage).mockResolvedValue({
      data: buildPackage({ id: 'package-new', name: 'Tiny Price Bundle' }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New package' })
    );
    await user.selectOptions(
      screen.getAllByLabelText('Branch')[1],
      'branch-makati'
    );
    await user.type(screen.getByLabelText('Package name'), 'Tiny Price Bundle');
    // 1.00 despite the two selected services summing to 600.
    await user.type(screen.getByLabelText(/Bundled price/), '1');
    await user.click(screen.getByRole('checkbox', { name: /Bath/ }));
    await user.click(screen.getByRole('checkbox', { name: /Blow-dry/ }));
    await user.click(screen.getByRole('button', { name: 'Save package' }));

    await waitFor(() => {
      expect(maintenanceApi.createPackage).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ bundled_price: 1 })
      );
    });
  });

  it('AC-3: editing a package replaces its included services and price in place', async () => {
    vi.mocked(maintenanceApi.updatePackage).mockResolvedValue({
      data: buildPackage({
        bundled_price: 700,
        package_services: [
          { service_id: 'service-1' },
          { service_id: 'service-2' },
        ],
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    // Branch is locked when editing - a package belongs to one branch (MA22).
    expect(screen.getAllByLabelText('Branch')[1]).toBeDisabled();

    // Drop Brushing (service-3) from the included set.
    await user.click(screen.getByRole('checkbox', { name: /Brushing/ }));

    const priceInput = screen.getByLabelText(/Bundled price/);
    await user.clear(priceInput);
    await user.type(priceInput, '700');
    await user.click(screen.getByRole('button', { name: 'Save package' }));

    await waitFor(() => {
      expect(maintenanceApi.updatePackage).toHaveBeenCalledWith(
        'package-1',
        'token',
        {
          name: 'Golden Package',
          bundled_price: 700,
          service_ids: ['service-1', 'service-2'],
        }
      );
    });

    expect(await screen.findByText('PHP 700.00')).toBeInTheDocument();
    expect(screen.getByText('2 services')).toBeInTheDocument();
  });

  it('AC-3: deactivating a package flips its badge without a reload', async () => {
    vi.mocked(maintenanceApi.updatePackage).mockResolvedValue({
      data: buildPackage({ is_active: false }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(maintenanceApi.updatePackage).toHaveBeenCalledWith(
        'package-1',
        'token',
        { is_active: false }
      );
    });

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
  });
});
