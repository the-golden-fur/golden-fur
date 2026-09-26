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
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as staffApi from '../../api/staff.api';
import type { StaffProfile, StaffRole } from '../../staff.types';
import { StaffManagementPage } from './StaffManagementPage';

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
  createUnavailabilityBlock: vi.fn(),
  listPendingUnavailabilityRequests: vi.fn(),
  createStaffAccount: vi.fn(),
  manageStaffAccount: vi.fn(),
  resendAccountEmail: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

function buildProfile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-1',
    role: 'Groomer',
    username: 'jcruz',
    registered_email: 'jcruz@example.com',
    display_name: 'Jamie Cruz',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// The viewer's own role is resolved from their own row in the listStaff()
// response (see StaffManagementPage's comment on why the auth session can't
// be trusted for this), so every test's mocked list must include a row
// whose id matches the signed-in user - this builds that row.
function buildViewerProfile(role: StaffRole): StaffProfile {
  return buildProfile({
    id: 'admin-1',
    display_name: 'Signed-in Viewer',
    role,
  });
}

function renderPage(initialPath = '/staff/admin/staff') {
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
      { initialEntries: [initialPath] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/staff',
            element: createElement(StaffManagementPage),
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

describe('StaffManagementPage (#75)', () => {
  beforeEach(() => {
    vi.mocked(staffApi.listPendingUnavailabilityRequests).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [
        { id: 'branch-1', name: 'Makati', is_vet_branch: true },
        { id: 'branch-2', name: 'Southwoods', is_vet_branch: false },
      ],
      error: null,
    });
  });

  it('AC-1: redirects a non-Admin/Superadmin role to /staff/settings', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-1: renders under the "Staff Management" label', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Admin')],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Staff Management' })
    ).toBeInTheDocument();
  });

  it('AC-1 & AC-2: renders a StaffCard per staff member for an Admin viewer', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({ id: 'staff-1', display_name: 'Jamie Cruz' }),
        buildProfile({
          id: 'staff-2',
          display_name: 'Alex Reyes',
          role: 'Cashier',
        }),
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Jamie Cruz')).toBeInTheDocument();
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();
  });

  it('AC-2: every staff card shows the branch name, never a raw branch id', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        // Viewer scoped to the other branch, so only Jamie Cruz's card
        // matches "Makati" - keeps the assertion below unambiguous.
        buildProfile({
          id: 'admin-1',
          display_name: 'Signed-in Viewer',
          role: 'Superadmin',
          branch_id: 'branch-2',
        }),
        buildProfile({
          id: 'staff-1',
          display_name: 'Jamie Cruz',
          branch_id: 'branch-1',
        }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    // { selector: 'p' } disambiguates from the Superadmin branch filter's
    // own "Makati" <option> - both are legitimately on the page at once.
    expect(
      await screen.findByText('Makati', { selector: 'p' })
    ).toBeInTheDocument();
    expect(screen.queryByText('branch-1')).not.toBeInTheDocument();
  });

  it('AC-3: no approval-queue button or link remains on this page', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Admin')],
      error: null,
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Staff Management' });
    expect(
      screen.queryByText('Unavailability approval queue')
    ).not.toBeInTheDocument();
  });

  it('AC-2: does not offer a Branch filter for an Admin (branch-scoped) viewer', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Admin'), buildProfile()],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(
      screen.queryByRole('menuitem', { name: 'Branch' })
    ).not.toBeInTheDocument();
  });

  it('AC-2: offers a Branch filter for a Superadmin viewer', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Superadmin'), buildProfile()],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(
      screen.getByRole('menuitem', { name: 'Branch' })
    ).toBeInTheDocument();
  });

  it('AC-3: filtering by role updates the visible grid without navigating', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({
          id: 'staff-1',
          display_name: 'Jamie Cruz',
          role: 'Groomer',
        }),
        buildProfile({
          id: 'staff-2',
          display_name: 'Alex Reyes',
          role: 'Cashier',
        }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Role' }));
    await userEvent.click(
      screen.getByRole('button', { name: /Role: Superadmin/ })
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('option', { name: 'Cashier' })
    );

    expect(screen.queryByText('Jamie Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();
  });

  it('Notion-style remaster (session 110): a search box narrows the grid by name, username, or email', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({ id: 'staff-1', display_name: 'Jamie Cruz' }),
        buildProfile({
          id: 'staff-2',
          display_name: 'Alex Reyes',
          username: 'areyes',
        }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.type(
      screen.getByPlaceholderText('Search staff...'),
      'areyes'
    );

    expect(screen.queryByText('Jamie Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();
  });

  it('AC-4: an Admin can create an unavailability block on behalf of a staff member from the list', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildProfile(), buildViewerProfile('Admin')],
      error: null,
    });
    vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
      data: {
        id: 'block-1',
        staff_id: 'staff-1',
        start_time: '2026-01-01T00:00:00.000Z',
        end_time: '2026-01-01T01:00:00.000Z',
        reason: null,
        created_by: 'admin-1',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    // Gallery/Board (default view) trigger the actions menu via
    // right-click/long-press instead of a visible button - switch to Table,
    // which still has the persistent "..." trigger, to keep this test's
    // focus on the unavailability-block flow rather than the menu trigger.
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Jamie Cruz' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Set day(s) off' })
    );
    expect(
      screen.getByRole('dialog', { name: 'Set day(s) off - Jamie Cruz' })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /take the rest of today off/i })
    );

    await waitFor(() =>
      expect(staffApi.createUnavailabilityBlock).toHaveBeenCalledWith(
        'staff-1',
        'token',
        { quick_action: true }
      )
    );
    expect(
      await screen.findByText('Day-off request created.')
    ).toBeInTheDocument();
  });

  it('custom change: "Create staff account" only appears as a modal once its button is clicked', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Admin')],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: 'Create staff account' });
    expect(screen.queryByLabelText(/^username$/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Create staff account' })
    );

    const dialog = screen.getByRole('dialog', { name: 'Create staff account' });
    expect(within(dialog).getByLabelText(/^username$/i)).toBeInTheDocument();
  });

  it('gap closure: an Admin/Superadmin can deactivate a staff account from "Manage account"', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Superadmin'),
        buildProfile({ id: 'staff-1', display_name: 'Jamie Cruz' }),
      ],
      error: null,
    });
    vi.mocked(staffApi.manageStaffAccount).mockResolvedValue({
      data: buildProfile({
        id: 'staff-1',
        display_name: 'Jamie Cruz',
        is_active: false,
      }),
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Jamie Cruz' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Manage account' })
    );
    expect(
      screen.getByRole('dialog', { name: 'Manage account - Jamie Cruz' })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /deactivate account/i })
    );

    await waitFor(() =>
      expect(staffApi.manageStaffAccount).toHaveBeenCalledWith(
        'staff-1',
        'token',
        { is_active: false }
      )
    );
  });

  it('AC-4: the resend-email action is reachable from an existing staff profile, via "Manage account"', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({ id: 'staff-1', display_name: 'Jamie Cruz' }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Jamie Cruz' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Manage account' })
    );
    expect(
      screen.getByRole('button', { name: /resend account email/i })
    ).toBeInTheDocument();
  });

  it('Notion-style remaster: Gallery is the default view, and Table/List/Board are available alongside it', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({ id: 'staff-1', display_name: 'Jamie Cruz' }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('Jamie Cruz')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Jamie Cruz').closest('ul')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('Jamie Cruz')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gallery' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Jamie Cruz')).toBeInTheDocument();
  });

  it('Gallery and Board views have no visible "..." trigger, but right-click opens the actions menu', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({ id: 'staff-1', display_name: 'Jamie Cruz' }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    expect(
      screen.queryByRole('button', { name: 'Actions for Jamie Cruz' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Jamie Cruz'));
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Set day(s) off' })
    );
    expect(
      screen.getByRole('dialog', { name: 'Set day(s) off - Jamie Cruz' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(
      screen.queryByRole('button', { name: 'Actions for Jamie Cruz' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Jamie Cruz'));
    expect(
      screen.getByRole('menuitem', { name: 'Manage account' })
    ).toBeInTheDocument();
  });

  it('Board view groups by Role by default, and a Sort groups control offers Manual/Alphabetical', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewerProfile('Admin'),
        buildProfile({
          id: 'staff-1',
          display_name: 'Jamie Cruz',
          role: 'Groomer',
        }),
        buildProfile({
          id: 'staff-2',
          display_name: 'Alex Reyes',
          role: 'Cashier',
        }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));

    // One column per role, including empty ones - headings disambiguate
    // from a staff card's own role badge, which shows the same text.
    expect(
      screen.getByRole('heading', { name: /Groomer/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Cashier/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Superadmin/ })
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Sort groups')).toHaveValue('manual');
    await userEvent.selectOptions(
      screen.getByLabelText('Sort groups'),
      'alphabetical'
    );
    expect(screen.getByLabelText('Sort groups')).toHaveValue('alphabetical');
  });

  it('Board view offers a Branch group-by axis for a Superadmin viewer only', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Superadmin'), buildProfile()],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));

    const groupBySelect = screen.getByLabelText('Group by');
    expect(
      within(groupBySelect).getByRole('option', { name: 'Branch' })
    ).toBeInTheDocument();

    await userEvent.selectOptions(groupBySelect, 'branch');
    expect(screen.getByRole('heading', { name: /Makati/ })).toBeInTheDocument();
  });
});
