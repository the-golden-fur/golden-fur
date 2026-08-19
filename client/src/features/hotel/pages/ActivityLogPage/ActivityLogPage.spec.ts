import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as hotelApi from '../../api/hotel.api';
import type { StaffProfile } from '../../../staff/staff.types';
import { ActivityLogPage } from './ActivityLogPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../api/hotel.api', () => ({
  listActivityLog: vi.fn(),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-a',
    role,
    username: 'staff1',
    registered_email: 'staff1@example.com',
    display_name: 'Staff One',
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

function buildEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'log-1',
    branch_id: 'branch-a',
    stay_id: 'stay-1',
    care_log_entry_id: null,
    action: 'check_in',
    actor_staff_id: 'staff-1',
    description: 'Checked in for a Hotel stay',
    created_at: '2026-08-19T03:00:00.000Z',
    actor_staff: { display_name: 'Staff One' },
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/hotel/activity-log'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/hotel/activity-log',
            element: createElement(ActivityLogPage),
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

describe('ActivityLogPage (custom change: Hotel/Daycare activity logbook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a Receptionist (not in the allowed viewer set) to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff settings page')).toBeInTheDocument();
  });

  it('renders entries for an allowed viewer (Groomer), with action label, description, and actor', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(hotelApi.listActivityLog).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    renderPage();

    await screen.findByText('Checked in for a Hotel stay');
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Check-in')).toBeInTheDocument();
    expect(within(row).getByText(/Staff One/)).toBeInTheDocument();
  });

  it('shows "System" for a system-driven entry with no actor (e.g. the lazy Missed transition)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Superadmin'),
      error: null,
    });
    vi.mocked(hotelApi.listActivityLog).mockResolvedValue({
      data: [
        buildEntry({
          id: 'log-2',
          action: 'task_missed',
          actor_staff_id: null,
          actor_staff: null,
          description: 'Missed: Morning meal',
        }),
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Missed: Morning meal')).toBeInTheDocument();
    expect(screen.getByText(/System/)).toBeInTheDocument();
  });

  it('filters by action type', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Admin'),
      error: null,
    });
    vi.mocked(hotelApi.listActivityLog).mockResolvedValue({
      data: [
        buildEntry({ id: 'log-1', description: 'Checked in for a Hotel stay' }),
        buildEntry({
          id: 'log-2',
          action: 'task_completed',
          description: 'Completed: Morning meal',
        }),
      ],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Checked in for a Hotel stay')
      ).toBeInTheDocument()
    );
    expect(screen.getByText('Completed: Morning meal')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: 'task_completed' },
    });

    await waitFor(() =>
      expect(
        screen.queryByText('Checked in for a Hotel stay')
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('Completed: Morning meal')).toBeInTheDocument();
  });
});
