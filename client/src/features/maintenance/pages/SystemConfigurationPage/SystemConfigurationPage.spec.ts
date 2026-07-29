import { render, screen, waitFor } from '@testing-library/react';
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
import { SystemConfigurationPage } from './SystemConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/branches.api', () => ({
  listBranchesFull: vi.fn(),
  updateBranch: vi.fn(),
}));

const MAKATI: Branch = {
  id: 'branch-makati',
  name: 'Makati',
  address: '123 Ayala Ave',
  contact_number: '0917-000-0000',
  is_vet_branch: true,
  operating_hours: { monday: { open: '08:00', close: '18:00' } },
  timezone: 'Asia/Manila',
  created_at: '2026-06-25T00:00:00.000Z',
};

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
      {
        initialEntries: ['/staff/admin/maintenance/system-configuration'],
      },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/system-configuration',
            element: createElement(SystemConfigurationPage),
          }),
          createElement(Route, {
            path: '/staff/profile',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('SystemConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [MAKATI],
      error: null,
    });
  });

  it('redirects a non-Superadmin (e.g. Admin) role to /staff/profile', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(branchesApi.listBranchesFull).not.toHaveBeenCalled();
  });

  it('loads and displays the selected branch', async () => {
    renderPage();

    expect(await screen.findByLabelText('Branch name')).toHaveValue('Makati');
    expect(screen.getByLabelText('Address')).toHaveValue('123 Ayala Ave');
    expect(screen.getByLabelText('Monday opening time')).toHaveValue('08:00');
  });

  it('unchecking "Closed" for a day with no configured hours adds a default window', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByLabelText('Branch name');

    await user.click(
      screen.getAllByRole('checkbox', { name: /closed/i })[1] // Tuesday, currently closed
    );

    expect(
      await screen.findByLabelText('Tuesday opening time')
    ).toBeInTheDocument();
  });

  it('saves the branch, including operating hours', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: { ...MAKATI, address: '456 Makati Ave' },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const addressInput = await screen.findByLabelText('Address');
    await user.clear(addressInput);
    await user.type(addressInput, '456 Makati Ave');

    await user.click(
      screen.getByRole('button', { name: 'Save branch configuration' })
    );

    await waitFor(() => {
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({
          address: '456 Makati Ave',
          operating_hours: { monday: { open: '08:00', close: '18:00' } },
        })
      );
    });

    expect(
      await screen.findByText('Branch configuration updated.')
    ).toBeInTheDocument();
  });
});
