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
  size_s_multiplier: 1,
  size_m_multiplier: 1.1,
  size_l_multiplier: 1.25,
  size_xl_multiplier: 1.5,
  long_coat_addon: 50,
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

  it('AC-1: renders each service row with name, category badge, price, and status badge', async () => {
    renderPage();

    expect(await screen.findByText('Bath')).toBeInTheDocument();
    // selector-scoped: 'Grooming' also appears as a filter <option>.
    expect(
      screen.getByText('Grooming', { selector: 'span' })
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 300.00')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
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
      });
    });

    expect(await screen.findByText('Service created.')).toBeInTheDocument();
  });

  it('the pricing matrix preview is hidden entirely for non-Grooming categories', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );

    expect(
      screen.getByText(
        'Size & coat pricing matrix (Grooming) - derived, read-only'
      )
    ).toBeInTheDocument();

    // Two "Category" controls exist once the form is open (the list filter
    // and the form field) - the form's select is the second in DOM order.
    await user.selectOptions(screen.getAllByLabelText('Category')[1], 'Hotel');

    expect(
      screen.queryByText(
        'Size & coat pricing matrix (Grooming) - derived, read-only'
      )
    ).not.toBeInTheDocument();
  });

  it('AC-3: a branch availability toggle updates in place without a reload', async () => {
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
    const toggle = within(row).getByRole('switch', { name: 'Southwoods' });

    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(maintenanceApi.setServiceBranchAvailability).toHaveBeenCalledWith(
        'service-1',
        'token',
        {
          branch_id: 'branch-southwoods',
          is_available: false,
        }
      );
    });

    await waitFor(() => {
      expect(
        within(row).getByRole('switch', { name: 'Southwoods' })
      ).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('Issue #79: a single status toggle replaces the separate Deactivate/Activate actions', async () => {
    vi.mocked(maintenanceApi.updateService).mockResolvedValue({
      data: buildService({ is_active: false }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Bath')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deactivate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Activate' })
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole('switch', { name: 'Disable Bath' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(maintenanceApi.updateService).toHaveBeenCalledWith(
        'service-1',
        'token',
        { is_active: false }
      );
    });

    // Default status filter is "Active only", so the row disappears...
    await waitFor(() => {
      expect(screen.queryByText('Bath')).not.toBeInTheDocument();
    });

    // ...and switching to Inactive shows it with the Inactive badge and the
    // toggle now offering to re-enable it.
    await user.selectOptions(screen.getByLabelText('Status'), 'Inactive');
    expect(screen.getByText('Bath')).toBeInTheDocument();
    expect(
      screen.getByText('Inactive', { selector: 'span' })
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enable Bath' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});
