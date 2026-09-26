import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as branchesApi from '../../api/branches.api';
import type { Branch } from '../../maintenance.types';
import { BranchesPage } from './BranchesPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/branches.api', () => ({
  listBranchesFull: vi.fn(),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  archiveBranch: vi.fn(),
}));

function buildBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'branch-makati',
    name: 'Makati',
    address: '123 Ayala Ave',
    contact_number: '0917-000-0000',
    is_vet_branch: true,
    operating_hours: { monday: { open: '08:00', close: '18:00' } },
    timezone: 'Asia/Manila',
    is_active: true,
    archived_at: null,
    created_at: '2026-06-25T00:00:00.000Z',
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

function renderPage(
  props: { onNavigateToConfig?: ReturnType<typeof vi.fn> } = {}
) {
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
      { initialEntries: ['/staff/admin/maintenance/branches'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/branches',
            element: createElement(BranchesPage, props),
          }),
          createElement(Route, {
            path: '/staff/admin/maintenance/policies',
            element: createElement('div', null, 'Policies page'),
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

describe('BranchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [buildBranch()],
      error: null,
    });
  });

  it('redirects a non-Superadmin (e.g. Admin) role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(branchesApi.listBranchesFull).not.toHaveBeenCalled();
  });

  it('lists branches with name, address, type, and status', async () => {
    renderPage();

    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('123 Ayala Ave')).toBeInTheDocument();
    expect(screen.getByText('Veterinary')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('adds a branch via the modal', async () => {
    vi.mocked(branchesApi.createBranch).mockResolvedValue({
      data: buildBranch({ id: 'branch-new', name: 'Southwoods' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(screen.getByRole('button', { name: '+ Add branch' }));

    const dialog = screen.getByRole('dialog', { name: 'Add branch' });
    await user.type(within(dialog).getByLabelText('Branch name'), 'Southwoods');
    await user.type(
      within(dialog).getByLabelText('Address'),
      '456 Filinvest Ave'
    );
    // Timezone already defaults to 'Asia/Manila' (EMPTY_FORM) - no need to
    // clear/retype it, that's what the payload assertion below expects.
    await user.click(
      within(dialog).getByRole('button', { name: 'Add branch' })
    );

    await waitFor(() =>
      expect(branchesApi.createBranch).toHaveBeenCalledWith('token', {
        name: 'Southwoods',
        address: '456 Filinvest Ave',
        contact_number: null,
        is_vet_branch: false,
        timezone: 'Asia/Manila',
        operating_hours: {},
      })
    );
    expect(await screen.findByText('Southwoods')).toBeInTheDocument();
  }, 15000); // heavier than the other tests here (full create form incl.
  // the 7-day operating-hours table) - flaky against the 5s default only
  // under parallel test-file load, passes well within it standalone.

  it('Edit pre-fills the modal and saves via updateBranch', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ address: '456 Makati Ave' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit branch' });
    expect(within(dialog).getByLabelText('Branch name')).toHaveValue('Makati');
    expect(within(dialog).getByLabelText('Monday opening time')).toHaveValue(
      '08:00'
    );

    const addressInput = within(dialog).getByLabelText('Address');
    await user.clear(addressInput);
    await user.type(addressInput, '456 Makati Ave');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({ address: '456 Makati Ave' })
      )
    );
    expect(await screen.findByText('Branch updated.')).toBeInTheDocument();
  });

  it('deactivates a branch from the "..." menu', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ is_active: false }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        { is_active: false }
      )
    );
  });

  it('hides Archive while a branch is active, shows it once inactive', async () => {
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [buildBranch({ is_active: false })],
      error: null,
    });
    vi.mocked(branchesApi.archiveBranch).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(branchesApi.archiveBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token'
      )
    );
    expect(screen.queryByText('Makati')).not.toBeInTheDocument();
  });

  it('Configure calls onNavigateToConfig, pre-scoped to that branch, when embedded in Settings', async () => {
    const onNavigateToConfig = vi.fn();
    const user = userEvent.setup();
    renderPage({ onNavigateToConfig });
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    expect(onNavigateToConfig).toHaveBeenCalledWith(
      '/staff/admin/maintenance/policies',
      { initialBranchId: 'branch-makati', lockBranchSelector: true }
    );
  });

  it('Configure falls back to a plain navigation when reached standalone (no onNavigateToConfig)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    expect(await screen.findByText('Policies page')).toBeInTheDocument();
  });
});
