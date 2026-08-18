import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../api/maintenance.api';
import type {
  Package,
  PackagePricingConfiguration,
  Service,
} from '../../maintenance.types';
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
  getPackagePricingConfiguration: vi.fn(),
  updatePackagePricingConfiguration: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

const PACKAGE_PRICING_CONFIGURATION: PackagePricingConfiguration = {
  id: 'package-pricing-1',
  bundle_discount_percentage: 0.1,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

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
            path: '/staff/settings',
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
        buildService({ id: 'service-2', name: 'Blow-dry', base_price: 200 }),
        buildService({
          id: 'service-3',
          name: 'Brushing',
          base_price: 150,
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
    vi.mocked(maintenanceApi.getPackagePricingConfiguration).mockResolvedValue({
      data: PACKAGE_PRICING_CONFIGURATION,
      error: null,
    });
  });

  it('AC-4: redirects a non-Admin/Superadmin role to /staff/settings', async () => {
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
    expect(
      screen.getByText('Makati', { selector: 'span' })
    ).toBeInTheDocument();
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

  it('Epic B #83: builder requires a branch before listing services, derives the bundled price live, and creates the package with no bundled_price field', async () => {
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
    await user.click(screen.getByRole('checkbox', { name: /Bath/ }));
    await user.click(screen.getByRole('checkbox', { name: /Blow-dry/ }));

    // Live-derived preview: (300 + 200) * 0.9 = 450, no manual price field.
    expect(screen.getByText('PHP 450.00')).toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: /Bundled price/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save package' }));

    await waitFor(() => {
      expect(maintenanceApi.createPackage).toHaveBeenCalledWith('token', {
        branch_id: 'branch-southwoods',
        name: 'Fresh Coat Bundle',
        service_ids: ['service-1', 'service-2'],
        use_pricing_matrix: false,
        requires_downpayment: false,
      });
    });

    expect(await screen.findByText('Package created.')).toBeInTheDocument();
  });

  it('#83 AC-4: shows a clear empty state before two services are selected', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New package' })
    );
    await user.selectOptions(
      screen.getAllByLabelText('Branch')[1],
      'branch-makati'
    );

    expect(
      screen.getByText('Add two or more services to see the bundled price.')
    ).toBeInTheDocument();
  });

  it('Custom change (services/packages actions menu): a row exposes Configure, Branch Availability, and (once inactive) Archive behind a single "..." menu instead of separate always-visible buttons', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Golden Package')).closest(
      'li'
    ) as HTMLElement;

    expect(
      within(row).queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Deactivate' })
    ).not.toBeInTheDocument();

    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    ).toBeInTheDocument();
    // The package starts Active, so Archive (inactive-only) isn't offered yet.
    expect(
      screen.queryByRole('menuitem', { name: 'Archive' })
    ).not.toBeInTheDocument();
  });

  it('AC-3: editing a package replaces its included services in place', async () => {
    vi.mocked(maintenanceApi.updatePackage).mockResolvedValue({
      data: buildPackage({
        bundled_price: 450,
        package_services: [
          { service_id: 'service-1' },
          { service_id: 'service-2' },
        ],
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Golden Package')).closest(
      'li'
    ) as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    // Branch is locked when editing - a package belongs to one branch (MA22).
    expect(screen.getAllByLabelText('Branch')[1]).toBeDisabled();

    // Drop Brushing (service-3) from the included set.
    await user.click(screen.getByRole('checkbox', { name: /Brushing/ }));
    await user.click(screen.getByRole('button', { name: 'Save package' }));

    await waitFor(() => {
      expect(maintenanceApi.updatePackage).toHaveBeenCalledWith(
        'package-1',
        'token',
        {
          name: 'Golden Package',
          service_ids: ['service-1', 'service-2'],
          requires_downpayment: false,
          downpayment_amount: null,
          downpayment_type: null,
        }
      );
    });

    expect(await screen.findByText('PHP 450.00')).toBeInTheDocument();
    expect(screen.getByText('2 services')).toBeInTheDocument();
  });

  it('#83: editing the bundle discount % saves via package_pricing_configuration', async () => {
    vi.mocked(
      maintenanceApi.updatePackagePricingConfiguration
    ).mockResolvedValue({
      data: {
        ...PACKAGE_PRICING_CONFIGURATION,
        bundle_discount_percentage: 0.2,
      },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Golden Package')).closest(
      'li'
    ) as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const discountInput = screen.getByLabelText('Bundle discount (%)');
    await user.clear(discountInput);
    await user.type(discountInput, '20');
    await user.click(screen.getByRole('button', { name: 'Save discount %' }));

    await waitFor(() => {
      expect(
        maintenanceApi.updatePackagePricingConfiguration
      ).toHaveBeenCalledWith('token', { bundle_discount_percentage: 0.2 });
    });

    expect(
      await screen.findByText('Bundle discount updated.')
    ).toBeInTheDocument();
  });

  it("Custom change (services/packages actions menu): Branch Availability opens a modal with the package's one branch, and its toggle deactivates the package without a reload", async () => {
    vi.mocked(maintenanceApi.updatePackage).mockResolvedValue({
      data: buildPackage({ is_active: false }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Active')).toBeInTheDocument();

    const row = (await screen.findByText('Golden Package')).closest(
      'li'
    ) as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Branch Availability - Golden Package',
    });
    const toggle = within(dialog).getByRole('switch', { name: 'Makati' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(maintenanceApi.updatePackage).toHaveBeenCalledWith(
        'package-1',
        'token',
        { is_active: false }
      );
    });

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
  });

  it('Custom change (services/packages actions menu): Archive only appears once a package is inactive', async () => {
    vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
      data: [buildPackage({ is_active: false })],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Golden Package')).closest(
      'li'
    ) as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
  });
});
