import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import * as staffApi from '../../api/staff.api';
import type { StaffProfile } from '../../staff.types';
import { StaffProfilePage } from './StaffProfilePage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  updateStaffProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  createUnavailabilityBlock: vi.fn(),
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
    phone_number: '555-0100',
    emergency_contact_name: 'Alex Cruz',
    emergency_contact_number: '555-0101',
    preferred_communication_channel: 'Text',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'jcruz@example.com' },
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
      createElement(StaffProfilePage)
    )
  );
}

describe('StaffProfilePage', () => {
  it('AC-1: renders the avatar, display name, contact fields, and comms preference from getStaffProfile', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile(),
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Jamie Cruz' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Jamie Cruz');
    expect(screen.getByLabelText(/phone number/i)).toHaveValue('555-0100');
    expect(screen.getByLabelText(/emergency contact name/i)).toHaveValue(
      'Alex Cruz'
    );
    expect(screen.getByLabelText(/preferred communication/i)).toHaveValue(
      'Text'
    );
  });

  it('AC-2: saving an edited field calls updateStaffProfile and reflects the update without reloading', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile(),
      error: null,
    });
    vi.mocked(staffApi.updateStaffProfile).mockResolvedValue({
      data: buildProfile({ display_name: 'Jamie R. Cruz' }),
      error: null,
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Jamie Cruz' });

    const nameInput = screen.getByLabelText(/display name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Jamie R. Cruz');
    await userEvent.click(
      screen.getByRole('button', { name: /save profile/i })
    );

    await waitFor(() =>
      expect(staffApi.updateStaffProfile).toHaveBeenCalledWith(
        'staff-1',
        'token',
        expect.objectContaining({ display_name: 'Jamie R. Cruz' })
      )
    );

    expect(
      await screen.findByRole('heading', { name: 'Jamie R. Cruz' })
    ).toBeInTheDocument();
    expect(screen.getByText('Profile saved.')).toBeInTheDocument();
  });

  it('shows an inline error when saving fails', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile(),
      error: null,
    });
    vi.mocked(staffApi.updateStaffProfile).mockResolvedValue({
      data: null,
      error: 'Invalid payload',
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Jamie Cruz' });
    await userEvent.click(
      screen.getByRole('button', { name: /save profile/i })
    );

    expect(await screen.findByText('Invalid payload')).toBeInTheDocument();
  });
});
