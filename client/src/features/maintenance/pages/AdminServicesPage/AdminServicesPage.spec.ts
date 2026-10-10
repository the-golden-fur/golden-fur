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
  setServicePricingCells: vi.fn(),
  updateService: vi.fn(),
  archiveService: vi.fn(),
  setServiceBranchAvailability: vi.fn(),
  setServiceBranchPrice: vi.fn(),
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
    // selector-scoped: 'Grooming' also appears in the Filter menu once
    // opened - not an issue here since the menu starts closed.
    expect(
      screen.getByText('Grooming', { selector: 'span' })
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 300.00')).toBeInTheDocument();
    // Category/Branch are now FilterSortBar pill fields, not always-visible
    // selects - confirm they're offered in the Filter menu.
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Filter' }));
    expect(
      screen.getByRole('menuitem', { name: 'Category' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Branch' })
    ).toBeInTheDocument();
  });

  it('AC-1: a Category filter tile narrows the list without navigating', async () => {
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

    // Category defaults to the first category (Grooming) - open the tile's
    // popover and pick Veterinary instead.
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Category' }));
    await user.click(
      screen.getByRole('button', { name: /Category: Grooming/ })
    );
    const popover = screen.getByRole('dialog', {
      name: 'Edit Category filter',
    });
    await user.click(
      within(popover).getByRole('option', { name: 'Veterinary' })
    );

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
    // Superadmin, not the default Admin viewer - a branch-scoped Admin
    // can't uncheck a branch other than their own (see BranchMultiSelect's
    // lockedBranchId), which is exactly what this test needs to do.
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
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

  it('per-item weight x coat pricing: a Superadmin turns it on, overrides one cell, and the changed cell is saved', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(maintenanceApi.createService).mockResolvedValue({
      data: buildService({ id: 'service-new', name: 'Dematting' }),
      error: null,
    });
    vi.mocked(maintenanceApi.setServicePricingCells).mockResolvedValue({
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

    // Opt-in: no grid until the switch is on.
    expect(
      screen.queryByText('Price by weight class and coat')
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('switch', {
        name: /Price varies by weight class and coat/,
      })
    );

    // Every cell starts at the formula's price for the base price.
    const smallShort = screen.getByLabelText('Small (S), short coat price');
    expect(smallShort).toHaveValue(350);
    expect(screen.getAllByText('Formula')).toHaveLength(8);

    const largeLong = screen.getByLabelText('Large (L), long coat price');
    await user.clear(largeLong);
    await user.type(largeLong, '650');
    expect(screen.getByText('Own price')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => {
      expect(maintenanceApi.createService).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ base_price: 350, use_pricing_matrix: true })
      );
    });
    // Only the changed cell is sent; the other 7 keep following the formula.
    expect(maintenanceApi.setServicePricingCells).toHaveBeenCalledWith(
      'service-new',
      'token',
      { cells: [{ weight_class: 'L', coat_type: 'LC', price: 650 }] }
    );
    expect(await screen.findByText('Service created.')).toBeInTheDocument();
  });

  it('per-item weight x coat pricing: an Admin sees the switch and grid but cannot change them', async () => {
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [buildService({ use_pricing_matrix: true })],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    expect(
      screen.getByRole('switch', {
        name: /Price varies by weight class and coat/,
      })
    ).toBeDisabled();
    expect(
      screen.getByText('Only a Superadmin can change these prices.')
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Large (L), long coat price', {
        selector: 'input',
      })
    ).not.toBeInTheDocument();
  });

  it('Architectural-Change-History: the "average service time" field shows for every category and is submitted', async () => {
    vi.mocked(maintenanceApi.createService).mockResolvedValue({
      data: buildService({ id: 'service-new', name: 'Full Groom' }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );

    // Grooming (the default category) now exposes the duration input - it
    // used to be Hotel/Daycare only.
    const durationField = screen.getByLabelText(
      'Average service time (minutes)'
    );
    await user.type(screen.getByLabelText('Name'), 'Full Groom');
    await user.type(screen.getByLabelText('Base price (PHP)'), '900');
    await user.type(durationField, '90');

    await user.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => {
      expect(maintenanceApi.createService).toHaveBeenCalledWith('token', {
        name: 'Full Groom',
        category: 'Grooming',
        base_price: 900,
        duration_minutes: 90,
        requires_assessed_pet: true,
        captures_pet_assessment: false,
        use_pricing_matrix: false,
        icon: null,
        image_url: null,
      });
    });
  });

  it('the pricing matrix grid is opt-in for Grooming and hidden entirely for non-Grooming categories', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'New service' })
    );

    // Custom change (pricing matrix fix): off by default even for Grooming -
    // the checkbox exists, but the preview doesn't render until it's checked.
    const matrixCheckbox = screen.getByRole('switch', {
      name: /Price varies by weight class and coat/,
    });
    expect(matrixCheckbox).not.toBeChecked();
    expect(
      screen.queryByText('Price by weight class and coat')
    ).not.toBeInTheDocument();

    await user.click(matrixCheckbox);

    expect(
      screen.getByText('Price by weight class and coat')
    ).toBeInTheDocument();

    // Two "Category" controls exist once the form is open (the list filter
    // and the form field) - the form's select is the second in DOM order.
    await user.selectOptions(screen.getByLabelText('Category'), 'Hotel');

    expect(
      screen.queryByRole('switch', {
        name: /Price varies by weight class and coat/,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Price by weight class and coat')
    ).not.toBeInTheDocument();
  });

  it('Custom change (services/packages actions menu): a service row exposes Configure, Rename and Archive (no separate Branch Availability) behind a single "..." menu instead of separate always-visible controls', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;

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
      screen.queryByRole('menuitem', { name: 'Branch Availability' })
    ).not.toBeInTheDocument();
  });

  it('Config-menu consistency: a service row also exposes Rename and Archive (never Deactivate) behind the "..." menu', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate' })
    ).not.toBeInTheDocument();
  });

  it('Rename opens a small pop-up and saves only the new name', async () => {
    vi.mocked(maintenanceApi.updateService).mockResolvedValue({
      data: buildService({ name: 'Deluxe Bath' }),
      error: null,
    });
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: /new service name/i });
    await user.clear(input);
    await user.type(input, 'Deluxe Bath');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(maintenanceApi.updateService).toHaveBeenCalledWith(
        expect.any(String),
        'token',
        { name: 'Deluxe Bath' }
      )
    );
    expect(await screen.findByText('Deluxe Bath')).toBeInTheDocument();
  });

  it('Archive asks for confirmation, then removes the row from the list', async () => {
    vi.mocked(maintenanceApi.archiveService).mockResolvedValue({
      data: null,
      error: null,
    });
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(maintenanceApi.archiveService).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(maintenanceApi.archiveService).toHaveBeenCalledWith(
        expect.any(String),
        'token'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Bath')).not.toBeInTheDocument()
    );
  });

  it('Archive shows the server error (e.g. still used by a package) and keeps the row', async () => {
    vi.mocked(maintenanceApi.archiveService).mockResolvedValue({
      data: null,
      error: 'This service is still used by package "Spa Day".',
    });
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(
      await screen.findByText(/still used by package/)
    ).toBeInTheDocument();
    expect(screen.getByText('Bath')).toBeInTheDocument();
  });

  it('Custom change (services/packages actions menu): Configure opens the edit form in a modal instead of pushing the list down', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit service' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Bath');
  });

  describe('closing the form with unsaved edits', () => {
    async function openConfigureAndRename(
      user: ReturnType<typeof userEvent.setup>
    ) {
      const row = (await screen.findByText('Bath')).closest(
        'tr'
      ) as HTMLElement;
      await user.click(
        within(row).getByRole('button', { name: 'Actions for Bath' })
      );
      await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

      const dialog = screen.getByRole('dialog', { name: 'Edit service' });
      const name = within(dialog).getByLabelText('Name');
      await user.clear(name);
      await user.type(name, 'Bubble Bath');

      return dialog;
    }

    it('asks before discarding, and keeps the edits on "Keep editing"', async () => {
      renderPage();
      const user = userEvent.setup();
      const dialog = await openConfigureAndRename(user);

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      const confirm = screen.getByRole('dialog', {
        name: 'Discard unsaved changes?',
      });
      await user.click(
        within(confirm).getByRole('button', { name: 'Keep editing' })
      );

      expect(
        screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })
      ).not.toBeInTheDocument();
      expect(
        within(
          screen.getByRole('dialog', { name: 'Edit service' })
        ).getByLabelText('Name')
      ).toHaveValue('Bubble Bath');
    });

    it('closes the form on "Discard changes"', async () => {
      renderPage();
      const user = userEvent.setup();
      const dialog = await openConfigureAndRename(user);

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await user.click(
        within(
          screen.getByRole('dialog', { name: 'Discard unsaved changes?' })
        ).getByRole('button', { name: 'Discard changes' })
      );

      expect(
        screen.queryByRole('dialog', { name: 'Edit service' })
      ).not.toBeInTheDocument();
    });

    it('closes straight away when nothing was edited', async () => {
      renderPage();
      const user = userEvent.setup();

      const row = (await screen.findByText('Bath')).closest(
        'tr'
      ) as HTMLElement;
      await user.click(
        within(row).getByRole('button', { name: 'Actions for Bath' })
      );
      await user.click(screen.getByRole('menuitem', { name: 'Configure' }));
      await user.click(
        within(screen.getByRole('dialog', { name: 'Edit service' })).getByRole(
          'button',
          { name: 'Cancel' }
        )
      );

      expect(
        screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Edit service' })
      ).not.toBeInTheDocument();
    });
  });

  it('Configure carries the per-branch "Available at" selection (there is no separate Branch Availability action)', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Bath')).closest('tr') as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Bath' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit service' });
    expect(within(dialog).getByText('Available at')).toBeInTheDocument();
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
    await user.selectOptions(screen.getByLabelText('Category'), 'Daycare');

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

  it('switches to Table, List, and Board (grouped by Category by default)', async () => {
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

    const user = userEvent.setup();
    const { container } = renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Bath')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Bath')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    // One column per category present in SERVICE_CATEGORIES.
    expect(
      container.querySelectorAll('section:not([aria-labelledby])')
    ).toHaveLength(5);
    expect(screen.getByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Wellness Exam')).toBeInTheDocument();
  });

  it('tap-to-hold: Board view has no persistent "..." button - right-click/long-press opens the same menu instead', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Bath');

    await user.click(screen.getByRole('button', { name: 'Board' }));
    await screen.findByText('Bath');

    expect(
      screen.queryByRole('button', { name: 'Actions for Bath' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Bath'));
    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
  });

  it('defaults to Active-only via a pre-added Status filter tile', async () => {
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        buildService({ id: '1', name: 'Bath', is_active: true }),
        buildService({ id: '2', name: 'Old Service', is_active: false }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Bath');
    expect(screen.queryByText('Old Service')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Status: Active/ })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Status: Active/ }));
    const popover = screen.getByRole('dialog', { name: 'Edit Status filter' });
    await user.click(within(popover).getByRole('option', { name: 'Inactive' }));

    expect(screen.getByText('Old Service')).toBeInTheDocument();
  });

  // Custom change (per-branch service price): a Superadmin can give a branch
  // its own price for a service, e.g. Hotel at PHP 500 a night in Southwoods.
  describe('branch prices', () => {
    const HOTEL = buildService({
      id: 'service-hotel',
      category: 'Hotel',
      name: 'Overnight Stay',
      base_price: 850,
      duration_minutes: 1440,
      service_pricing_tiers: [],
      service_branch_availability: [
        {
          service_id: 'service-hotel',
          branch_id: 'branch-makati',
          is_available: true,
          price_override: null,
        },
        {
          service_id: 'service-hotel',
          branch_id: 'branch-southwoods',
          is_available: true,
          price_override: null,
        },
      ],
    });

    function hotelWithSouthwoodsPrice(price: number | null): Service {
      return {
        ...HOTEL,
        service_branch_availability: [
          HOTEL.service_branch_availability![0],
          { ...HOTEL.service_branch_availability![1], price_override: price },
        ],
      };
    }

    async function openConfigure(user: ReturnType<typeof userEvent.setup>) {
      const row = (await screen.findByText('Overnight Stay')).closest(
        'tr'
      ) as HTMLElement;
      await user.click(
        within(row).getByRole('button', { name: 'Actions for Overnight Stay' })
      );
      await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

      return screen.getByRole('dialog', { name: 'Edit service' });
    }

    beforeEach(() => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Superadmin')],
        error: null,
      });
      vi.mocked(maintenanceApi.listServices).mockResolvedValue({
        data: [HOTEL],
        error: null,
      });
      vi.mocked(maintenanceApi.updateService).mockResolvedValue({
        data: HOTEL,
        error: null,
      });
      vi.mocked(maintenanceApi.setServiceBranchPrice).mockImplementation(
        (_serviceId, _token, payload) =>
          Promise.resolve({
            data: {
              service_id: 'service-hotel',
              branch_id: payload.branch_id,
              is_available: true,
              price_override: payload.price_override,
            },
            error: null,
          })
      );
    });

    it('lets a Superadmin give one branch its own price, leaving the others on the base price', async () => {
      renderPage();
      const user = userEvent.setup();
      const dialog = await openConfigure(user);

      const makatiPrice = within(dialog).getByLabelText('Makati price (PHP)');
      const southwoodsPrice = within(dialog).getByLabelText(
        'Southwoods price (PHP)'
      );
      expect(makatiPrice).toHaveValue(null);
      expect(southwoodsPrice).toHaveValue(null);

      await user.type(southwoodsPrice, '500');
      await user.click(screen.getByRole('button', { name: 'Save service' }));

      await waitFor(() =>
        expect(maintenanceApi.setServiceBranchPrice).toHaveBeenCalledWith(
          'service-hotel',
          'token',
          { branch_id: 'branch-southwoods', price_override: 500 }
        )
      );
      expect(maintenanceApi.setServiceBranchPrice).toHaveBeenCalledTimes(1);

      // ...and the list then shows it beside the base price.
      const row = (await screen.findByText('Overnight Stay')).closest(
        'tr'
      ) as HTMLElement;
      expect(
        await within(row).findByText('Southwoods: PHP 500.00')
      ).toBeInTheDocument();
    });

    it('shows an existing branch price and clears it when the box is emptied', async () => {
      vi.mocked(maintenanceApi.listServices).mockResolvedValue({
        data: [hotelWithSouthwoodsPrice(500)],
        error: null,
      });
      vi.mocked(maintenanceApi.updateService).mockResolvedValue({
        data: hotelWithSouthwoodsPrice(500),
        error: null,
      });

      renderPage();
      const user = userEvent.setup();
      const dialog = await openConfigure(user);

      const southwoodsPrice = within(dialog).getByLabelText(
        'Southwoods price (PHP)'
      );
      expect(southwoodsPrice).toHaveValue(500);

      await user.clear(southwoodsPrice);
      await user.click(screen.getByRole('button', { name: 'Save service' }));

      await waitFor(() =>
        expect(maintenanceApi.setServiceBranchPrice).toHaveBeenCalledWith(
          'service-hotel',
          'token',
          { branch_id: 'branch-southwoods', price_override: null }
        )
      );
    });

    it('saves nothing extra when no branch price was changed', async () => {
      renderPage();
      const user = userEvent.setup();
      await openConfigure(user);

      await user.click(screen.getByRole('button', { name: 'Save service' }));

      await waitFor(() =>
        expect(maintenanceApi.updateService).toHaveBeenCalled()
      );
      expect(maintenanceApi.setServiceBranchPrice).not.toHaveBeenCalled();
    });

    it('does not offer branch prices to an Admin', async () => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Admin')],
        error: null,
      });

      renderPage();
      const user = userEvent.setup();
      const dialog = await openConfigure(user);

      expect(
        within(dialog).queryByLabelText('Southwoods price (PHP)')
      ).not.toBeInTheDocument();
    });

    it('does not offer branch prices for Daycare, which is billed by the hour', async () => {
      vi.mocked(maintenanceApi.listServices).mockResolvedValue({
        data: [
          {
            ...HOTEL,
            category: 'Daycare',
            first_hour_fee: 100,
            succeeding_hour_fee: 50,
            daycare_overnight_fee: null,
          },
        ],
        error: null,
      });

      renderPage();
      const user = userEvent.setup();
      const dialog = await openConfigure(user);

      expect(
        within(dialog).queryByLabelText('Southwoods price (PHP)')
      ).not.toBeInTheDocument();
    });
  });
});
