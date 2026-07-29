import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import * as staffApi from '../../api/staff.api';
import type { StaffProfile } from '../../staff.types';
import { DaysOffPage } from './DaysOffPage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  createUnavailabilityBlock: vi.fn(),
  listStaff: vi.fn(),
}));

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

const PROFILE: StaffProfile = {
  id: 'staff-1',
  branch_id: 'branch-makati',
  role: 'Receptionist',
  username: 'receptionist',
  registered_email: 'staff@example.com',
  display_name: 'Front Desk',
  profile_photo_url: null,
  phone_number: null,
  emergency_contact_name: null,
  emergency_contact_number: null,
  preferred_communication_channel: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(DaysOffPage)
    )
  );
}

describe('DaysOffPage', () => {
  beforeEach(() => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({ data: [], error: null });
  });

  it('loads the profile and renders the availability badge plus the request form', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    renderPage();

    expect(await screen.findByText('Days Off')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /take the rest of today off/i })
    ).toBeInTheDocument();
  });

  it('creating a day-off request shows the success message', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
      data: {
        id: 'block-1',
        staff_id: 'staff-1',
        start_time: '2026-07-29T00:00:00.000Z',
        end_time: '2026-07-29T10:00:00.000Z',
        reason: null,
        created_by: 'staff-1',
        created_at: '2026-07-29T00:00:00.000Z',
      },
      error: null,
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /take the rest of today off/i })
    );

    expect(
      await screen.findByText('Day-off request created.')
    ).toBeInTheDocument();
  });

  it('shows an error state when the profile fails to load', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: null,
      error: 'Could not load your profile.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load your profile.')
    ).toBeInTheDocument();
  });
});
