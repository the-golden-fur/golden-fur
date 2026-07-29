import { render, screen, waitFor } from '@testing-library/react';
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

  it('AC-2: does not show a branch filter for an Admin (branch-scoped) viewer', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Admin'), buildProfile()],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    expect(screen.queryByText('Branch')).not.toBeInTheDocument();
  });

  it('AC-2: shows a branch filter for a Superadmin viewer', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Superadmin'), buildProfile()],
      error: null,
    });

    renderPage();

    await screen.findByText('Jamie Cruz');
    expect(screen.getByText('Branch')).toBeInTheDocument();
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

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Cashier');

    expect(screen.queryByText('Jamie Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();
  });

  it('AC-4: an Admin can create an unavailability block on behalf of a staff member from the list', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      // Jamie Cruz (staff-1) listed first so getAllByRole(...)[0] below
      // targets her card's button, not the viewer's own card.
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
    await userEvent.click(
      screen.getAllByRole('button', { name: /set day\(s\) off/i })[0]
    );
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

  it('gap closure: shows a "Create staff account" section for an Admin/Superadmin viewer', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewerProfile('Admin')],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /create staff account/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
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
    // Index 1, not 0: the viewer's own card renders first (it's not filtered
    // out of the list), so index 0 is the signed-in Superadmin's own button.
    await userEvent.click(
      screen.getAllByRole('button', { name: /manage account/i })[1]
    );
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

  it('AC-4: the resend-email action is reachable from an existing staff profile', async () => {
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
      screen.getAllByRole('button', { name: /resend account email/i }).length
    ).toBeGreaterThan(0);
  });
});
