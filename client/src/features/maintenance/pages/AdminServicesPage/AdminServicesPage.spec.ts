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
import type { PricingConfiguration, Service } from '../../maintenance.types';
import { AdminServicesPage } from './AdminServicesPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServices: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  setServiceBranchAvailability: vi.fn(),
  getPricingConfiguration: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

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
    requires_assessed_pet: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    service_pricing_tiers: [
      {
        id: 'service-1:S:SC',
        service_id: 'service-1',
        weight_class: 'S',
        coat_type: 'SC',
        price: 300,
      },
    ],
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

// The viewer's role comes from their own row in the listStaff() response
// (same pattern as AdminStaffListPage) - every test's mock must include it.
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
      { initialEntries: ['/staff/admin/maintenance/services'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/services',
            element: createElement(AdminServicesPage),
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

describe('AdminServicesPage', () => {
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
    vi.mocked(maintenanceApi.getPricingConfiguration).mockResolvedValue({
      data: PRICING_CONFIGURATION,
      error: null,
    });
  });

  it('AC-5: redirects a non-Admin/Superadmin role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.listServices).not.toHaveBeenCalled();
  });

  it('AC-1: renders each service row with name, category badge, and price', async () => {
    renderPage();

    expect(await screen.findByText('Bath')).toBeInTheDocument();
    // selector-scoped: 'Grooming' also appears as a filter <option>.
    expect(
      screen.getByText('Grooming', { selector: 'span' })
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 300.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
  });

  it('AC-1: category filter narrows the list without navigating', async () => {
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        buildService(),
        buildService({
          id: 'service-2',
          name: 'Wellness Exam',
          category: 'Veterinary',
          service_pricing_tiers: [],
          service_branch_availability: [],
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Wellness Exam')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Category'), 'Veterinary');

    expect(screen.queryByText('Bath')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness Exam')).toBeInTheDocument();
  });

  it('custom change: the search box narrows the list by name', async () => {
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        buildService(),
        buildService({
          id: 'service-2',
          name: 'Wellness Exam',
          category: 'Veterinary',
          service_pricing_tiers: [],
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Wellness Exam')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search services...'), 'Bath');

    expect(screen.getByText('Bath')).toBeInTheDocument();
    expect(screen.queryByText('Wellness Exam')).not.toBeInTheDocument();
  });

  it('custom change: the create form offers a branch multiselect that disables an unchecked branch after creation', async () => {
    vi.mocked(maintenanceApi.createService).mockResolvedValue({
      data: buildService({ id: 'service-new', name: 'Dematting' }),
      error: null,
    });
    vi.mocked(maintenanceApi.setServiceBranchAvailability).mockResolvedValue({
      data: {
        service_id: 'service-new',
        branch_id: 'branch-southwoods',
        is_available: false,
      },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );
    await user.type(screen.getByLabelText('Name'), 'Dematting');
    await user.type(screen.getByLabelText('Base price (PHP)'), '350');

    // Both branches are checked by default, matching what createService
    // already seeds server-side.
    const southwoods = screen.getByRole('checkbox', { name: 'Southwoods' });
    expect(southwoods).toBeChecked();
    await user.click(southwoods);

    await user.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => {
      expect(maintenanceApi.setServiceBranchAvailability).toHaveBeenCalledWith(
        'service-new',
        'token',
        {
          branch_id: 'branch-southwoods',
          is_available: false,
        }
      );
    });
  });

  it('Epic B #81: create form no longer accepts pricing_tiers - the matrix is derived read-only', async () => {
    vi.mocked(maintenanceApi.createService).mockResolvedValue({
      data: buildService({ id: 'service-new', name: 'Dematting' }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );
    await user.type(screen.getByLabelText('Name'), 'Dematting');
    await user.type(screen.getByLabelText('Base price (PHP)'), '350');

    // Custom change (pricing matrix fix): the matrix is now opt-in - off by
    // default, so the preview doesn't render until the checkbox is checked.
    await user.click(
      screen.getByRole('switch', {
        name: /Derive price from weight\/coat matrix/,
      })
    );

    // The derived preview shows the computed price, with no editable inputs
    // of its own (only the Name/Base price form fields remain spinbuttons).
    expect(screen.getByText('PHP 350.00')).toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => {
      expect(maintenanceApi.createService).toHaveBeenCalledWith('token', {
        name: 'Dematting',
        category: 'Grooming',
        base_price: 350,
        requires_assessed_pet: true,
        use_pricing_matrix: true,
        requires_downpayment: false,
      });
    });

    expect(await screen.findByText('Service created.')).toBeInTheDocument();
  });

  it('the pricing matrix preview is opt-in for Grooming and hidden entirely for non-Grooming categories', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );

    // Custom change (pricing matrix fix): off by default even for Grooming -
    // the checkbox exists, but the preview doesn't render until it's checked.
    const matrixCheckbox = screen.getByRole('switch', {
      name: /Derive price from weight\/coat matrix/,
    });
    expect(matrixCheckbox).not.toBeChecked();
    expect(
      screen.queryByText(
        'Size & coat pricing matrix (Grooming) - derived, read-only'
      )
    ).not.toBeInTheDocument();

    await user.click(matrixCheckbox);

    expect(
      screen.getByText(
        'Size & coat pricing matrix (Grooming) - derived, read-only'
      )
    ).toBeInTheDocument();

    // Two "Category" controls exist once the form is open (the list filter
    // and the form field) - the form's select is the second in DOM order.
    await user.selectOptions(screen.getAllByLabelText('Category')[1], 'Hotel');

    expect(
      screen.queryByRole('switch', {
        name: /Derive price from weight\/coat matrix/,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Size & coat pricing matrix (Grooming) - derived, read-only'
      )
    ).not.toBeInTheDocument();
  });

  it('Custom change (services/packages actions menu): a service row exposes Configure and Branch Availability behind a single "..." menu instead of separate always-visible controls', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('li') as HTMLElement;

    // No inline per-branch toggles, Edit button, or global Disable switch
    // on the row itself anymore - they're actions behind the kebab menu.
    expect(
      within(row).queryByRole('switch', { name: 'Southwoods' })
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('switch', { name: 'Disable Bath' })
    ).not.toBeInTheDocument();

    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    ).toBeInTheDocument();
  });

  it('Custom change (services/packages actions menu): Configure opens the edit form in a modal instead of pushing the list down', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('li') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit service' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Bath');
  });

  it('Custom change (services/packages actions menu): Branch Availability opens a modal listing every branch with its own toggle', async () => {
    vi.mocked(maintenanceApi.setServiceBranchAvailability).mockResolvedValue({
      data: {
        service_id: 'service-1',
        branch_id: 'branch-southwoods',
        is_available: false,
      },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('li') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Branch Availability - Bath',
    });
    const toggle = within(dialog).getByRole('switch', { name: 'Southwoods' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(maintenanceApi.setServiceBranchAvailability).toHaveBeenCalledWith(
        'service-1',
        'token',
        { branch_id: 'branch-southwoods', is_available: false }
      );
    });
  });

  it('Custom change (Daycare fee configuration follow-up): a Daycare service form hides base price and creates without it', async () => {
    vi.mocked(maintenanceApi.createService).mockResolvedValue({
      data: buildService({
        id: 'service-new',
        name: 'Daycare (per hour)',
        category: 'Daycare',
        first_hour_fee: 100,
        succeeding_hour_fee: 50,
        daycare_overnight_fee: null,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );
    await user.type(screen.getByLabelText('Name'), 'Daycare (per hour)');
    await user.selectOptions(
      screen.getAllByLabelText('Category')[1],
      'Daycare'
    );

    expect(screen.queryByLabelText('Base price (PHP)')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('First hour fee (PHP)'), '100');
    await user.type(
      screen.getByLabelText(
        'Succeeding hour fee (PHP, per additional billable hour)'
      ),
      '50'
    );

    await user.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => {
      expect(maintenanceApi.createService).toHaveBeenCalledWith(
        'token',
        expect.not.objectContaining({ base_price: expect.anything() })
      );
    });
    expect(maintenanceApi.createService).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        category: 'Daycare',
        first_hour_fee: 100,
        succeeding_hour_fee: 50,
      })
    );

    expect(await screen.findByText('Service created.')).toBeInTheDocument();
  });

  it('bug fix: turning off "Requires a downpayment" during edit nulls the stale amount/type instead of resubmitting them (services_downpayment_amount_check)', async () => {
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        buildService({
          requires_downpayment: true,
          downpayment_amount: 500,
          downpayment_type: 'Flat',
        }),
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.updateService).mockResolvedValue({
      data: buildService({
        requires_downpayment: false,
        downpayment_amount: null,
        downpayment_type: null,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const downpaymentToggle = screen.getByRole('switch', {
      name: 'Requires a downpayment before the service can start',
    });
    expect(downpaymentToggle).toHaveAttribute('aria-checked', 'true');

    await user.click(downpaymentToggle);

    // The amount/type fields unmount once the toggle is off - their stale
    // values must not leak into the submitted payload.
    expect(
      screen.queryByLabelText('Downpayment amount (PHP)')
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => {
      expect(maintenanceApi.updateService).toHaveBeenCalledWith(
        'service-1',
        'token',
        expect.objectContaining({
          requires_downpayment: false,
          downpayment_amount: null,
          downpayment_type: null,
        })
      );
    });
  });
});
