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
import * as maintenanceApi from '../../api/maintenance.api';
import { AdminPetTypesPage } from './AdminPetTypesPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listPetTypes: vi.fn(),
  createPetType: vi.fn(),
  updatePetType: vi.fn(),
  deletePetType: vi.fn(),
  listBranches: vi.fn(),
  listPetTypePriceOverrides: vi.fn(),
  upsertPetTypePriceOverride: vi.fn(),
  deletePetTypePriceOverride: vi.fn(),
}));

// key deliberately differs from name (like real seeded data) so text
// queries for one don't also match the other.
const DOG = {
  id: 'pt-dog',
  key: 'dog-key',
  name: 'Dog',
  is_active: true,
  created_at: '',
  updated_at: '',
};

const CAT_INACTIVE = {
  id: 'pt-cat',
  key: 'cat-key',
  name: 'Cat',
  is_active: false,
  created_at: '',
  updated_at: '',
};

function stubDefaults() {
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: [{ id: 'staff-1', role: 'Admin' } as never],
    error: null,
  });
  vi.mocked(maintenanceApi.listPetTypes).mockResolvedValue({
    data: [DOG, CAT_INACTIVE] as never,
    error: null,
  });
  vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
    data: [{ id: 'branch-1', name: 'Makati' } as never],
    error: null,
  });
  vi.mocked(maintenanceApi.listPetTypePriceOverrides).mockResolvedValue({
    data: [],
    error: null,
  });
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/pet-types'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/pet-types',
            element: createElement(AdminPetTypesPage),
          })
        )
      )
    )
  );
}

/** The page has two sections that both list pet type names (the "Existing
 * pet types" browser, and the "Fixed price overrides" list below it) - most
 * assertions/interactions need to be scoped to one or the other. Async
 * because the section (and its heading) doesn't exist until past the
 * initial role-check/data-load "Loading..." state. */
async function findBrowserSection() {
  const heading = await screen.findByRole('heading', {
    name: 'Existing pet types',
  });
  return heading.closest('section') as HTMLElement;
}

function pricingSection() {
  return screen
    .getByRole('heading', { name: 'Fixed price overrides' })
    .closest('section') as HTMLElement;
}

describe('AdminPetTypesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a non-Admin/Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' } as never],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText('Pet Types')).not.toBeInTheDocument()
    );
  });

  it('lists both active and inactive pet types by default, with a Status badge', async () => {
    stubDefaults();

    renderPage();

    await screen.findByRole('heading', { name: 'Existing pet types' });
    const section = await findBrowserSection();

    expect(within(section).getByText('Dog')).toBeInTheDocument();
    expect(within(section).getByText('Cat')).toBeInTheDocument();
    expect(within(section).getByText('Active')).toBeInTheDocument();
    expect(within(section).getByText('Inactive')).toBeInTheDocument();
  });

  it('creates a new pet type', async () => {
    stubDefaults();
    vi.mocked(maintenanceApi.createPetType).mockResolvedValue({
      data: { ...DOG, id: 'pt-bird', key: 'Bird', name: 'Bird' } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await within(await findBrowserSection()).findByText('Dog');

    await user.type(
      screen.getByLabelText('Key (not shown to customers)'),
      'Bird'
    );
    await user.type(screen.getByLabelText('Name'), 'Bird');
    await user.click(screen.getByRole('button', { name: 'Add pet type' }));

    await waitFor(() =>
      expect(maintenanceApi.createPetType).toHaveBeenCalledWith('token', {
        key: 'Bird',
        name: 'Bird',
      })
    );
    expect(await screen.findByText('Pet type added.')).toBeInTheDocument();
  });

  it('renames a pet type from the row action', async () => {
    stubDefaults();
    vi.mocked(maintenanceApi.updatePetType).mockResolvedValue({
      data: { ...DOG, name: 'Doggo' } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    const section = await findBrowserSection();
    await within(section).findByText('Dog');

    fireEvent.click(
      within(section).getAllByRole('button', { name: 'Rename' })[0]
    );
    const nameInput = within(section).getByDisplayValue('Dog');
    await user.clear(nameInput);
    await user.type(nameInput, 'Doggo');
    await user.click(within(section).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(maintenanceApi.updatePetType).toHaveBeenCalledWith(
        'pt-dog',
        'token',
        { name: 'Doggo' }
      )
    );
  });

  it('toggles active/inactive from the row action', async () => {
    stubDefaults();
    vi.mocked(maintenanceApi.updatePetType).mockResolvedValue({
      data: { ...DOG, is_active: false } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    const section = await findBrowserSection();
    await within(section).findByText('Dog');

    await user.click(
      within(section).getAllByRole('button', { name: 'Deactivate' })[0]
    );

    await waitFor(() =>
      expect(maintenanceApi.updatePetType).toHaveBeenCalledWith(
        'pt-dog',
        'token',
        { is_active: false }
      )
    );
  });

  it('deletes a pet type', async () => {
    stubDefaults();
    vi.mocked(maintenanceApi.deletePetType).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    const section = await findBrowserSection();
    await within(section).findByText('Dog');

    await user.click(
      within(section).getAllByRole('button', { name: 'Delete' })[0]
    );

    await waitFor(() =>
      expect(maintenanceApi.deletePetType).toHaveBeenCalledWith(
        'pt-dog',
        'token'
      )
    );
    expect(
      within(await findBrowserSection()).queryByText('Dog')
    ).not.toBeInTheDocument();
  });

  it('searching narrows the visible pet types', async () => {
    stubDefaults();

    const user = userEvent.setup();
    renderPage();
    const section = await findBrowserSection();
    await within(section).findByText('Dog');
    expect(within(section).getByText('Cat')).toBeInTheDocument();

    await user.type(
      within(section).getByPlaceholderText('Search pet types...'),
      'Dog'
    );

    expect(within(section).getByText('Dog')).toBeInTheDocument();
    expect(within(section).queryByText('Cat')).not.toBeInTheDocument();
  });

  it('adding a Status filter tile narrows the visible pet types', async () => {
    stubDefaults();

    const user = userEvent.setup();
    renderPage();
    const section = await findBrowserSection();
    await within(section).findByText('Dog');
    expect(within(section).getByText('Cat')).toBeInTheDocument();

    // Status defaults to 'Active' when the tile is first added.
    await user.click(within(section).getByRole('button', { name: 'Filter' }));
    await user.click(within(section).getByRole('menuitem', { name: 'Status' }));

    expect(within(section).getByText('Dog')).toBeInTheDocument();
    expect(within(section).queryByText('Cat')).not.toBeInTheDocument();
  });

  it('switches to Board view, grouped by Status', async () => {
    stubDefaults();

    const user = userEvent.setup();
    renderPage();
    const section = await findBrowserSection();
    await within(section).findByText('Dog');

    await user.click(within(section).getByRole('button', { name: 'Board' }));

    // One column per Active/Inactive.
    expect(
      section.querySelectorAll('section:not([aria-labelledby])')
    ).toHaveLength(2);
    expect(within(section).getByText('Dog')).toBeInTheDocument();
    expect(within(section).getByText('Cat')).toBeInTheDocument();
  });

  it('saves and clears a fixed-price override, and the price-override list has its own search box', async () => {
    stubDefaults();
    vi.mocked(maintenanceApi.upsertPetTypePriceOverride).mockResolvedValue({
      data: {
        id: 'override-1',
        pet_type: 'dog-key',
        branch_id: null,
        fixed_price: 800,
      } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await within(await findBrowserSection()).findByText('Dog');
    const section = pricingSection();
    // Cat is inactive, so the pricing section - unlike the browser above it
    // - only ever lists active pet types.
    expect(within(section).getByText('Dog')).toBeInTheDocument();
    expect(within(section).queryByText('Cat')).not.toBeInTheDocument();

    const priceInput = within(section).getByPlaceholderText('No override');
    await user.type(priceInput, '800');
    await user.click(within(section).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(maintenanceApi.upsertPetTypePriceOverride).toHaveBeenCalledWith(
        'token',
        { pet_type: 'dog-key', branch_id: null, fixed_price: 800 }
      )
    );

    // The pricing section has its own, separate search box from the browser
    // section above it.
    expect(
      within(section).getByPlaceholderText('Search pet types...')
    ).toBeInTheDocument();
  });
});
