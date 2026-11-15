import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as developerApi from '../../api/developer.api';
import { DeveloperDashboardPage } from './DeveloperDashboardPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/developer.api', () => ({
  getDeveloperStats: vi.fn(),
}));

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'dev-1',
    branch_id: 'branch-1',
    role,
    username: 'dev1',
    registered_email: 'dev1@example.com',
    display_name: 'Dana Developer',
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
    user: { id: 'dev-1', email: 'dev1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/developer/dashboard'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/developer/dashboard',
            element: createElement(DeveloperDashboardPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff settings page'),
          })
        )
      )
    )
  );
}

describe('DeveloperDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a role that is not Developer or Superadmin (e.g. Admin)', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Staff settings page')).toBeInTheDocument()
    );
  });

  it('loads and renders every stat card', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Developer')],
      error: null,
    });
    vi.mocked(developerApi.getDeveloperStats).mockResolvedValue({
      data: {
        total_customers: 120,
        deactivated_customers: 7,
        total_staff: 40,
        deactivated_staff: 2,
        pending_bug_reports: 3,
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Pending Bug Reports/ })
    ).toHaveAttribute('href', '/staff/developer/bug-reports');
  });

  it('shows an error banner when the stats request fails', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(developerApi.getDeveloperStats).mockResolvedValue({
      data: null,
      error: 'Could not load the dashboard.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load the dashboard.')
    ).toBeInTheDocument();
  });
});
