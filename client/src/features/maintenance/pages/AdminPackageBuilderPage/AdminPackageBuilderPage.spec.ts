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
  PricingConfiguration,
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
  setPackageBranchAvailability: vi.fn(),
  getPackagePricingConfiguration: vi.fn(),
  updatePackagePricingConfiguration: vi.fn(),
  getPricingConfiguration: vi.fn(),
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

const PRICING_CONFIGURATION: PricingConfiguration = {
  id: 'pricing-config-1',
  size_s_rule_type: 'multiplier',
  size_s_rule_value: 1,
  size_m_rule_type: 'multiplier',
  size_m_rule_value: 1.1,
  size_l_rule_type: 'multiplier',
  size_l_rule_value: 1.25,
  size_xl_rule_type: 'multiplier',
  size_xl_rule_value: 1.5,
  coat_long_rule_type: 'flat',
  coat_long_rule_value: 50,
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
    use_pricing_matrix: false,
    requires_downpayment: false,
    downpayment_amount: null,
    downpayment_type: null,
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
    name: 'Golden Package',
    bundled_price: 650,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    use_pricing_matrix: false,
    requires_downpayment: false,
    downpayment_amount: null,
    downpayment_type: null,
    package_services: [
      { service_id: 'service-1' },
      { service_id: 'service-2' },
      { service_id: 'service-3' },
    ],
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
    vi.mocked(maintenanceApi.getPricingConfiguration).mockResolvedValue({
      data: PRICING_CONFIGURATION,
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

  it('AC-1: renders each package row with name, branch, service count, and price', async () => {
    renderPage();

    expect(await screen.findByText('Golden Package')).toBeInTheDocument();
    // selector-scoped: 'Makati' also appears as a filter <option>.
    expect(
      screen.getByText('Makati', { selector: 'span' })
    ).toBeInTheDocument();
    expect(screen.getByText('3 services')).toBeInTheDocument();
    expect(screen.getByText('PHP 650.00')).toBeInTheDocument();
  });

  it('AC-1: branch filter narrows the list without navigating', async () => {
    vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
      data: [
        buildPackage(),
        buildPackage({
          id: 'package-2',
          name: 'Southwoods Combo',
          package_branch_availability: [
            {
              package_id: 'package-2',
              branch_id: 'branch-southwoods',
              is_available: true,
            },
          ],
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

  it('Epic B #83 / custom change: builder requires at least one branch before listing services, derives the bundled price live, and creates the package with branch_ids (no branch_id or bundled_price field)', async () => {
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
      screen.getByText(
        'Select at least one branch to pick its available services.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Bath/ })
    ).not.toBeInTheDocument();

    // The branch multiselect (custom change: replaces the old single-branch
    // <select> - a package is no longer scoped to exactly one branch/MA22).
    await user.click(screen.getByRole('checkbox', { name: 'Southwoods' }));

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
        branch_ids: ['branch-southwoods'],
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
    await user.click(screen.getByRole('checkbox', { name: 'Makati' }));

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

    // Custom change: a package's branches are no longer locked once created
    // (MA22 is gone) - editable the same as Services/Service Types.
    expect(screen.getByRole('checkbox', { name: 'Makati' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Makati' })).toBeEnabled();

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
          use_pricing_matrix: false,
          requires_downpayment: false,
          downpayment_amount: null,
          downpayment_type: null,
        }
      );
    });

    expect(await screen.findByText('PHP 450.00')).toBeInTheDocument();
    expect(screen.getByText('2 services')).toBeInTheDocument();
  });

  it('custom change: the bundle discount % has no separate "read-only"/Save button - it saves together with the package via the main Save button', async () => {
    vi.mocked(
      maintenanceApi.updatePackagePricingConfiguration
    ).mockResolvedValue({
      data: {
        ...PACKAGE_PRICING_CONFIGURATION,
        bundle_discount_percentage: 0.2,
      },
      error: null,
    });
    vi.mocked(maintenanceApi.updatePackage).mockResolvedValue({
      data: buildPackage(),
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

    expect(screen.getByText('Bundled price')).toBeInTheDocument();
    expect(
      screen.queryByText('Bundled price (derived, read-only)')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save discount %' })
    ).not.toBeInTheDocument();

    const discountInput = screen.getByLabelText('Bundle discount (%)');
    await user.clear(discountInput);
    await user.type(discountInput, '20');

    await user.click(screen.getByRole('button', { name: 'Save package' }));

    await waitFor(() => {
      expect(
        maintenanceApi.updatePackagePricingConfiguration
      ).toHaveBeenCalledWith('token', { bundle_discount_percentage: 0.2 });
    });

    expect(maintenanceApi.updatePackage).toHaveBeenCalled();
  });

  it("custom change: Branch Availability now lists every branch (not just the package's one), fixing the previous bug where only one branch ever showed", async () => {
    vi.mocked(maintenanceApi.setPackageBranchAvailability).mockResolvedValue({
      data: {
        package_id: 'package-1',
        branch_id: 'branch-southwoods',
        is_available: true,
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
    await user.click(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Branch Availability - Golden Package',
    });

    // Both branches show up now, not just the package's own one.
    const makatiToggle = within(dialog).getByRole('switch', { name: 'Makati' });
    const southwoodsToggle = within(dialog).getByRole('switch', {
      name: 'Southwoods',
    });
    expect(makatiToggle).toHaveAttribute('aria-checked', 'true');
    expect(southwoodsToggle).toHaveAttribute('aria-checked', 'false');

    await user.click(southwoodsToggle);

    await waitFor(() => {
      expect(maintenanceApi.setPackageBranchAvailability).toHaveBeenCalledWith(
        'package-1',
        'token',
        {
          branch_id: 'branch-southwoods',
          is_available: true,
        }
      );
    });

    // Makati's own row is untouched - toggling Southwoods no longer flips
    // the whole package's is_active (that's now a separate control).
    expect(makatiToggle).toHaveAttribute('aria-checked', 'true');
  });

  it("custom change (unify active/available): no Configure Active toggle any more - turning off a package's only available branch makes Archive appear", async () => {
    vi.mocked(maintenanceApi.setPackageBranchAvailability).mockResolvedValue({
      data: {
        package_id: 'package-1',
        branch_id: 'branch-makati',
        is_available: false,
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

    expect(
      screen.queryByRole('switch', { name: 'Active' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Archive' })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    );

    await user.click(screen.getByRole('switch', { name: 'Makati' }));

    await waitFor(() => {
      expect(maintenanceApi.setPackageBranchAvailability).toHaveBeenCalledWith(
        'package-1',
        'token',
        { branch_id: 'branch-makati', is_available: false }
      );
    });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Golden Package' })
    );

    expect(
      await screen.findByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
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

  describe('package pricing matrix redesign (custom change)', () => {
    it("applies the matrix directly to the package's own derived price, independent of any member's own flag - and any service is selectable regardless of its own matrix/downpayment flags", async () => {
      // A member with its own matrix flag AND its own downpayment flag -
      // neither should affect whether it's selectable, and neither flag
      // should be consulted for the package's own price.
      vi.mocked(maintenanceApi.listServices).mockResolvedValue({
        data: [
          buildService({
            use_pricing_matrix: true,
            service_pricing_tiers: [
              { weight_class: 'S', coat_type: 'SC', price: 999 },
            ],
          }),
          buildService({
            id: 'service-2',
            name: 'Blow-dry',
            base_price: 200,
            requires_downpayment: true,
            downpayment_amount: 50,
            downpayment_type: 'Flat',
          }),
        ],
        error: null,
      });
      vi.mocked(maintenanceApi.createPackage).mockResolvedValue({
        data: buildPackage({ id: 'package-new', name: 'Fresh Coat Bundle' }),
        error: null,
      });

      renderPage();
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: 'New package' })
      );
      await user.click(screen.getByRole('checkbox', { name: 'Makati' }));

      // Both members are pickable despite their own matrix/downpayment flags.
      await user.click(screen.getByRole('checkbox', { name: /Bath/ }));
      await user.click(screen.getByRole('checkbox', { name: /Blow-dry/ }));

      // Flat total: (300 + 200) * 0.9 = 450.
      expect(screen.getByText('PHP 450.00')).toBeInTheDocument();

      await user.type(
        screen.getByLabelText('Package name'),
        'Fresh Coat Bundle'
      );

      const matrixToggle = screen.getByRole('switch', {
        name: 'Adjust price by pet size and coat',
      });
      expect(matrixToggle).toHaveAttribute('aria-checked', 'false');

      await user.click(matrixToggle);
      expect(matrixToggle).toHaveAttribute('aria-checked', 'true');

      // The breakdown grid derives from the package's own 450 total, not
      // from either member's own tier (999) - S/SC cell = 450 * 1.0 = 450.
      expect(
        screen.getByText('Size & coat pricing matrix - derived, read-only')
      ).toBeInTheDocument();
      expect(screen.getAllByText('PHP 450.00').length).toBeGreaterThan(1);

      await user.click(screen.getByRole('button', { name: 'Save package' }));

      await waitFor(() => {
        expect(maintenanceApi.createPackage).toHaveBeenCalledWith('token', {
          branch_ids: ['branch-makati'],
          name: 'Fresh Coat Bundle',
          service_ids: ['service-1', 'service-2'],
          use_pricing_matrix: true,
          requires_downpayment: false,
        });
      });
    });

    it('shows the package-level matrix/downpayment badges as separate pill tags in the package list, not appended text', async () => {
      vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
        data: [
          buildPackage({
            use_pricing_matrix: true,
            requires_downpayment: true,
            downpayment_amount: 200,
            downpayment_type: 'Flat',
          }),
        ],
        error: null,
      });

      renderPage();

      expect(await screen.findByText('PHP 650.00')).toBeInTheDocument();
      expect(screen.getByText('Varies by weight/coat')).toBeInTheDocument();
      expect(
        screen.getByText('Requires PHP 200.00 downpayment')
      ).toBeInTheDocument();
    });
  });

  describe('service/package sort options (custom change)', () => {
    it('offers a price sort alongside name for both packages and the service picker', async () => {
      renderPage();
      const user = userEvent.setup();

      // Package list's own SearchSortBar renders these once, before the
      // builder is even open.
      expect(await screen.findByText('Golden Package')).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Price (low-high)' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Price (high-low)' })
      ).toBeInTheDocument();

      // The service picker's own SearchSortBar adds a second copy of each
      // once the builder is open with a branch selected.
      await user.click(screen.getByRole('button', { name: 'New package' }));
      await user.click(screen.getByRole('checkbox', { name: 'Makati' }));

      expect(
        screen.getAllByRole('option', { name: 'Price (low-high)' })
      ).toHaveLength(2);
      expect(
        screen.getAllByRole('option', { name: 'Price (high-low)' })
      ).toHaveLength(2);
    });
  });

  describe('builder draft persistence (custom change)', () => {
    it('does not close on an outside/backdrop click', async () => {
      renderPage();
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: 'New package' })
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('presentation'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('resumes an in-progress new-package draft after Cancel, but starts fresh once a different package has been edited', async () => {
      renderPage();
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: 'New package' })
      );
      await user.type(screen.getByLabelText('Package name'), 'Draft Combo');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'New package' }));
      expect(screen.getByLabelText('Package name')).toHaveValue('Draft Combo');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      const row = (await screen.findByText('Golden Package')).closest(
        'li'
      ) as HTMLElement;
      await user.click(
        within(row).getByRole('button', { name: 'Actions for Golden Package' })
      );
      await user.click(screen.getByRole('menuitem', { name: 'Configure' }));
      expect(screen.getByLabelText('Package name')).toHaveValue(
        'Golden Package'
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Editing Golden Package should have cleared the earlier draft.
      await user.click(screen.getByRole('button', { name: 'New package' }));
      expect(screen.getByLabelText('Package name')).toHaveValue('');
    });
  });
});
