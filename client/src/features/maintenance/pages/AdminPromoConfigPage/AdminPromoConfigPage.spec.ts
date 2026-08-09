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
  Promo,
  PromoCapConfiguration,
  Service,
} from '../../maintenance.types';
import { AdminPromoConfigPage } from './AdminPromoConfigPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listServices: vi.fn(),
  listPackages: vi.fn(),
  listPromos: vi.fn(),
  createPromo: vi.fn(),
  updatePromo: vi.fn(),
  listBranches: vi.fn(),
  listPromoCapConfigurations: vi.fn(),
  upsertPromoCapConfiguration: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
  { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
];

const CAP_CONFIGURATIONS: PromoCapConfiguration[] = [
  {
    id: 'cap-default',
    branch_id: null,
    cap_type: 'percentage',
    cap_value: 20,
    updated_by_staff_id: null,
    updated_at: '2026-07-26T00:00:00.000Z',
  },
  {
    id: 'cap-makati',
    branch_id: 'branch-makati',
    cap_type: 'flat',
    cap_value: 150,
    updated_by_staff_id: null,
    updated_at: '2026-07-26T00:00:00.000Z',
  },
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
            path: '/staff/settings',
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
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(maintenanceApi.listPromoCapConfigurations).mockResolvedValue({
      data: CAP_CONFIGURATIONS,
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
    expect(maintenanceApi.listPromos).not.toHaveBeenCalled();
  });

  it('renders each promo as a card, not a table row', async () => {
    renderPage();

    expect(await screen.findByText('Summer Sale')).toBeInTheDocument();
    expect(screen.getByText('15% off')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01 to 2026-08-31')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('the promo cap configuration is embedded on this page (no longer a separate subpage)', async () => {
    renderPage();

    expect(await screen.findByText('Summer Sale')).toBeInTheDocument();
    expect(
      screen.getByText('Both branches (system-wide default)')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Makati' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Southwoods' })
    ).toBeInTheDocument();
  });

  it('saves a branch promo cap independently of the default cap', async () => {
    vi.mocked(maintenanceApi.upsertPromoCapConfiguration).mockResolvedValue({
      data: { ...CAP_CONFIGURATIONS[1], cap_value: 300 },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Makati' });
    const makatiCard = screen
      .getByRole('heading', { name: 'Makati' })
      .closest('article') as HTMLElement;
    const valueInput = within(makatiCard).getByLabelText('Cap value (PHP)');
    await user.clear(valueInput);
    await user.type(valueInput, '300');
    await user.click(within(makatiCard).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(maintenanceApi.upsertPromoCapConfiguration).toHaveBeenCalledWith(
        'token',
        { branch_id: 'branch-makati', cap_type: 'flat', cap_value: 300 }
      );
    });

    expect(await screen.findByText('Promo cap updated.')).toBeInTheDocument();
  });

  it('branch scope filter narrows the list without navigating', async () => {
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

  it('search narrows the visible cards by name', async () => {
    vi.mocked(maintenanceApi.listPromos).mockResolvedValue({
      data: [buildPromo(), buildPromo({ id: 'promo-2', name: 'Winter Deal' })],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Summer Sale')).toBeInTheDocument();
    expect(screen.getByText('Winter Deal')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search'), 'winter');

    expect(screen.queryByText('Summer Sale')).not.toBeInTheDocument();
    expect(screen.getByText('Winter Deal')).toBeInTheDocument();
  });

  it('the timing filter narrows to Ended promos', async () => {
    vi.mocked(maintenanceApi.listPromos).mockResolvedValue({
      data: [
        buildPromo(),
        buildPromo({
          id: 'promo-2',
          name: 'Old Deal',
          start_date: '2020-01-01',
          end_date: '2020-01-31',
        }),
      ],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Summer Sale')).toBeInTheDocument();
    expect(screen.getByText('Old Deal')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Timing'), 'Ended');

    expect(screen.queryByText('Summer Sale')).not.toBeInTheDocument();
    expect(screen.getByText('Old Deal')).toBeInTheDocument();
  });

  it('the create form has no condition-based option - only a date range', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New promo' }));

    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Condition-based' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Condition note')).not.toBeInTheDocument();
  });

  it('creates a date-bounded promo with no condition_note field in the payload', async () => {
    vi.mocked(maintenanceApi.createPromo).mockResolvedValue({
      data: buildPromo({ id: 'promo-new', name: 'Fall Deal' }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New promo' }));
    await user.type(screen.getByLabelText('Name'), 'Fall Deal');
    await user.type(screen.getByLabelText(/Discount value/), '10');
    await user.type(screen.getByLabelText('Start date'), '2026-09-01');
    await user.type(screen.getByLabelText('End date'), '2026-09-30');
    await user.click(screen.getByRole('button', { name: 'Save promo' }));

    await waitFor(() => {
      expect(maintenanceApi.createPromo).toHaveBeenCalledWith('token', {
        name: 'Fall Deal',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        discount_type: 'Percentage',
        value: 10,
        scope_type: 'all_services',
        branch_scope: 'both',
      });
    });

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

  it('editing an existing promo updates it in place and clears any legacy condition_note', async () => {
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
        expect.objectContaining({ value: 25, condition_note: null })
      );
    });

    expect(await screen.findByText('25% off')).toBeInTheDocument();
  });

  it('the status toggle activates/deactivates a promo without a full page reload', async () => {
    vi.mocked(maintenanceApi.updatePromo).mockResolvedValue({
      data: buildPromo({ is_active: false }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('switch', { name: 'Disable Summer Sale' })
    );

    await waitFor(() => {
      expect(maintenanceApi.updatePromo).toHaveBeenCalledWith(
        'promo-1',
        'token',
        { is_active: false }
      );
    });

    // Default status filter is "Active only", so the card disappears...
    await waitFor(() => {
      expect(screen.queryByText('Summer Sale')).not.toBeInTheDocument();
    });

    // ...and switching to Inactive shows it again with the Inactive badge.
    await user.selectOptions(screen.getByLabelText('Status'), 'Inactive');
    expect(screen.getByText('Summer Sale')).toBeInTheDocument();
    expect(
      screen.getByText('Inactive', { selector: 'span' })
    ).toBeInTheDocument();
  });
});
