import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  setDiscountBranchAvailability: vi.fn(),
  archiveDiscount: vi.fn(),
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
    name: 'Senior Citizen',
    is_mandated: true,
    discount_type: 'Percentage',
    value: 20,
    scope_type: 'category',
    scope_service_id: null,
    scope_package_id: null,
    scope_category: 'Grooming',
    // Custom change (unify active/available): true, consistent with the
    // default discount_branch_availability below (available at Makati) -
    // is_active is derived from availability everywhere now.
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    archived_at: null,
    discount_branch_availability: [
      {
        discount_id: 'discount-1',
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

async function openActionsMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(
    (await screen.findAllByRole('button', { name: `Actions for ${name}` }))[0]
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

  it('AC-1: shows Senior Citizen and PWD, each badged Government-Mandated (combined list, session 110 remaster)', async () => {
    renderPage();

    expect(await screen.findByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();
    // Both discounts in this test are mandated - one badge per row, no
    // separate "Government-Mandated"/"Custom Discounts" sections any more
    // (combined into one list + Type badge, per the Ideas backlog).
    expect(screen.getAllByText('Government-Mandated')).toHaveLength(2);
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    // Custom change (unify active/available): no row-level toggle and no
    // Active/Inactive badge - Branch Availability is the only control, and
    // is_active is purely derived from it.
    expect(
      screen.queryByRole('switch', { name: /^Enable/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
  });

  it('Config-menu consistency: a custom discount offers Configure, Rename and Archive (never Deactivate or a separate Branch Availability), even while active', async () => {
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        buildDiscount({
          id: 'discount-custom',
          name: 'Loyalty Discount',
          is_mandated: false,
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Loyalty Discount');

    for (const name of ['Configure', 'Rename', 'Archive']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Branch Availability' })
    ).not.toBeInTheDocument();
  });

  it('a government-mandated discount has the same Configure, Rename and Archive menu as any other', async () => {
    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Senior Citizen');

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Branch Availability' })
    ).not.toBeInTheDocument();
  });

  it('Rename saves only the new discount name', async () => {
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        buildDiscount({
          id: 'discount-custom',
          name: 'Loyalty Discount',
          is_mandated: false,
        }),
      ],
      error: null,
    });
    vi.mocked(discountsApi.updateDiscount).mockResolvedValue({
      data: buildDiscount({
        id: 'discount-custom',
        name: 'VIP Discount',
        is_mandated: false,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Loyalty Discount');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: /new discount name/i });
    await user.clear(input);
    await user.type(input, 'VIP Discount');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(discountsApi.updateDiscount).toHaveBeenCalledWith(
        'discount-custom',
        'token',
        { name: 'VIP Discount' }
      )
    );
    expect(await screen.findByText('VIP Discount')).toBeInTheDocument();
  });

  it('Archive asks for confirmation, then removes the discount from the list', async () => {
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        buildDiscount({
          id: 'discount-custom',
          name: 'Loyalty Discount',
          is_mandated: false,
        }),
      ],
      error: null,
    });
    vi.mocked(discountsApi.archiveDiscount).mockResolvedValue({
      data: null,
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Loyalty Discount');
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(discountsApi.archiveDiscount).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(discountsApi.archiveDiscount).toHaveBeenCalledWith(
        'discount-custom',
        'token'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Loyalty Discount')).not.toBeInTheDocument()
    );
  });

  it('branch builder: New custom discount opens in a modal dialog, not an inline panel', async () => {
    renderPage();
    const user = userEvent.setup();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', { name: 'New custom discount' })
    );

    expect(
      await screen.findByRole('dialog', { name: 'Create discount' })
    ).toBeInTheDocument();
  });

  it('branch builder: create-custom-discount form saves name, type, value, scope, and a branch multiselect', async () => {
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

    const dialog = await screen.findByRole('dialog', {
      name: 'Create discount',
    });

    await user.type(screen.getByLabelText('Name'), 'Staff Appreciation');
    await user.type(screen.getByLabelText(/Discount value/), '10');
    await user.selectOptions(screen.getByLabelText('Scope'), 'category');
    await user.selectOptions(screen.getByLabelText('Category'), 'Grooming');
    // Branch multiselect (custom change): a checkbox per branch inside the
    // modal, not a single-select dropdown - picking more than one is the
    // whole point of the feature.
    await user.click(screen.getByRole('checkbox', { name: 'Makati' }));
    await user.click(screen.getByRole('checkbox', { name: 'Southwoods' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save discount' })
    );

    await waitFor(() => {
      expect(discountsApi.createDiscount).toHaveBeenCalledWith('token', {
        branch_ids: ['branch-makati', 'branch-southwoods'],
        name: 'Staff Appreciation',
        discount_type: 'Percentage',
        value: 10,
        scope_type: 'category',
        scope_category: 'Grooming',
      });
    });

    expect(await screen.findByText('Discount created.')).toBeInTheDocument();
  });

  it("a mandated discount's name field is editable in the Configure form (identity is mandated_kind, not the name)", async () => {
    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Senior Citizen');
    await user.click(
      await screen.findByRole('menuitem', { name: 'Configure' })
    );

    expect(await screen.findByLabelText('Name')).toBeEnabled();
  });

  it('Configure carries the per-branch "Available at" selection, so availability needs no menu item of its own', async () => {
    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Senior Citizen');
    await user.click(
      await screen.findByRole('menuitem', { name: 'Configure' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Available at')).toBeInTheDocument();
  });

  it('Epic B #85 (custom change): renders discounts as a list, not table rows or cards', async () => {
    renderPage();

    expect(await screen.findByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    // Two mandated rows in one <ul>.
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
  });

  it('#85 AC-2: search narrows the visible rows by name', async () => {
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search by name...'), 'pwd');

    expect(screen.queryByText('Senior Citizen')).not.toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();
  });

  it('#85 AC-3: the Scope filter tile narrows to Category', async () => {
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

    // Scope's default value is the first option (Service) - open the tile's
    // popover and pick Category instead.
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Scope' }));
    await user.click(screen.getByRole('button', { name: /Scope: Service/ }));
    const popover = screen.getByRole('dialog', { name: 'Edit Scope filter' });
    await user.click(within(popover).getByRole('option', { name: 'Category' }));

    expect(screen.getByText('Senior Citizen')).toBeInTheDocument();
    expect(
      screen.queryByText('Custom Service Discount')
    ).not.toBeInTheDocument();
  });

  it('switches to Table view, and Board view grouped by Type', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Senior Citizen');

    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Senior Citizen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    // One column per Type (Government-Mandated, Custom).
    expect(
      screen.getAllByText('Government-Mandated').length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Senior Citizen')).toBeInTheDocument();
    expect(screen.getByText('PWD')).toBeInTheDocument();
  });

  it('tap-to-hold: Board view has no persistent "..." button - right-click/long-press opens the same menu instead', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Senior Citizen');

    await user.click(screen.getByRole('button', { name: 'Board' }));
    await screen.findByText('Senior Citizen');

    expect(
      screen.queryByRole('button', { name: 'Actions for Senior Citizen' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Senior Citizen'));
    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
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

  it('Rename on a mandated discount saves only the new name', async () => {
    vi.mocked(discountsApi.updateDiscount).mockResolvedValue({
      data: buildDiscount({ name: 'Golden Years' }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await openActionsMenu(user, 'Senior Citizen');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: /new discount name/i });
    await user.clear(input);
    await user.type(input, 'Golden Years');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(discountsApi.updateDiscount).toHaveBeenCalledWith(
        'discount-1',
        'token',
        { name: 'Golden Years' }
      )
    );
  });
});
