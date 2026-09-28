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

// The Policies form has its own dedicated spec - stub it here, but record the
// props so we can see the Configure modal embeds it for the right branch.
vi.mock(
  '../../../booking/pages/PolicyConfigurationPage/PolicyConfigurationPage',
  () => ({
    PolicyConfigurationPage: (props: {
      initialBranchId?: string;
      embedded?: boolean;
      lockBranchSelector?: boolean;
    }) =>
      createElement(
        'p',
        { 'data-testid': 'policies' },
        `policies for ${props.initialBranchId} embedded=${String(props.embedded)} locked=${String(props.lockBranchSelector)}`
      ),
  })
);

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
      { initialEntries: ['/staff/admin/maintenance/branches'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/branches',
            element: createElement(BranchesPage),
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

  it('a row offers Configure, Rename and Archive - never Details, Deactivate or Reactivate', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );

    for (const name of ['Configure', 'Rename', 'Archive']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitem', { name: 'Details' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Reactivate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  it('Rename saves only the branch name', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ name: 'Makati Central' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: /new branch name/i });
    await user.clear(input);
    await user.type(input, 'Makati Central');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        { name: 'Makati Central' }
      )
    );
    expect(await screen.findByText('Makati Central')).toBeInTheDocument();
  });

  it('archives an active branch from the "..." menu after confirming', async () => {
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

    expect(branchesApi.archiveBranch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(branchesApi.archiveBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Makati')).not.toBeInTheDocument()
    );
  });

  async function openConfigure() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    return {
      user,
      dialog: await screen.findByRole('dialog', { name: 'Configure Makati' }),
    };
  }

  it('Configure opens ONE modal (not a page) with the branch details and its policies', async () => {
    const { dialog } = await openConfigure();

    expect(within(dialog).getByLabelText('Branch name')).toHaveValue('Makati');
    expect(within(dialog).getByLabelText('Monday opening time')).toHaveValue(
      '08:00'
    );
    // Policies are embedded in the same modal, pre-scoped and locked to it.
    expect(within(dialog).getByTestId('policies')).toHaveTextContent(
      'policies for branch-makati embedded=true locked=true'
    );
    // Still on the Branches list underneath - nothing navigated away.
    expect(
      screen.getByRole('heading', { name: 'Branches' })
    ).toBeInTheDocument();
  });

  it('saving the details in the Configure modal calls updateBranch and updates the list behind it', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ address: '456 Makati Ave' }),
      error: null,
    });
    const { user, dialog } = await openConfigure();

    const address = within(dialog).getByLabelText('Address');
    await user.clear(address);
    await user.type(address, '456 Makati Ave');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({ address: '456 Makati Ave' })
      )
    );
    expect(
      await within(dialog).findByText('Branch details saved.')
    ).toBeInTheDocument();
  });

  it('shows the server error inside the Configure modal when saving the details fails', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: null,
      error: 'Address is invalid',
    });
    const { user, dialog } = await openConfigure();

    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    expect(await within(dialog).findByText('Address is invalid')).toBeVisible();
  });

  it('closes the Configure modal with the close button', async () => {
    const { user } = await openConfigure();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
