import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import { DaycareCheckInPanel } from './DaycareCheckInPanel';
import { DaycareQueuePage } from './DaycareQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('./DaycareCheckInPanel', () => ({
  DaycareCheckInPanel: vi.fn(() => null),
}));
vi.mock('./DaycareCheckoutPanel', () => ({
  DaycareCheckoutPanel: vi.fn(() => null),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'reception-1',
    branch_id: 'branch-makati',
    role,
    username: 'reception1',
    registered_email: 'reception1@example.com',
    display_name: 'Reception One',
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
    user: { id: 'reception-1', email: 'reception1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/daycare/queue'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/daycare/queue',
            element: createElement(DaycareQueuePage),
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

describe('DaycareQueuePage', () => {
  it('redirects a Cashier viewer (not a check-in/checkout role) to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Cashier'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  // Queue redesign RBAC change: Groomer/Pet Assistant now have Daycare
  // advance rights alongside Receptionist/Admin/Supervisor/Superadmin,
  // since Daycare has no dedicated assigned-staff role - see
  // DAYCARE_ADVANCE_ROLES server-side.
  it('allows a Groomer viewer in (was denied before the advance-rights change)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Daycare Queue')).toBeInTheDocument();
    expect(vi.mocked(DaycareCheckInPanel)).toHaveBeenCalled();
  });
});
