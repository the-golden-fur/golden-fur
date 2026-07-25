import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../api/staff.api';
import type { StaffProfile } from '../../staff.types';
import { StaffDashboardPage } from './StaffDashboardPage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

function buildProfile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'user-1',
    branch_id: 'branch-1',
    role: 'Groomer',
    username: 'user1',
    registered_email: 'user1@example.com',
    display_name: 'Test User',
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

function renderDashboard(initialPath: string) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
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
            path: '/staff/dashboard',
            element: createElement(StaffDashboardPage),
          }),
          createElement(Route, {
            path: '/staff/dashboard/:roleSlug',
            element: createElement(StaffDashboardPage),
          })
        )
      )
    )
  );
}

describe('StaffDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Groomer' }),
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a bare /staff/dashboard visit to the viewer's own role slug", async () => {
    renderDashboard('/staff/dashboard');

    expect(await screen.findByText('Groomer dashboard')).toBeInTheDocument();
  });

  it("redirects away from a mismatched role slug to the viewer's own dashboard", async () => {
    renderDashboard('/staff/dashboard/admin');

    expect(await screen.findByText('Groomer dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });

  it('renders the matching dashboard tiles for the resolved role', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Admin' }),
      error: null,
    });

    renderDashboard('/staff/dashboard/admin');

    expect(await screen.findByText('Admin dashboard')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /staff management/i })
    ).toHaveAttribute('href', '/staff/admin/staff');
  });

  it('renders a placeholder tile for a role whose module is not built yet', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Cashier' }),
      error: null,
    });

    renderDashboard('/staff/dashboard/cashier');

    expect(await screen.findByText('Cashier dashboard')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
