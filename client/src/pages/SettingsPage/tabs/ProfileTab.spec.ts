import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../shared/auth/api/auth.api';
import * as staffApi from '../../../features/staff/api/staff.api';
import * as customerApi from '../../../features/customers/api/customer.api';
import type { StaffProfile } from '../../../features/staff/staff.types';
import { ProfileTab } from './ProfileTab';

vi.mock('../../../features/staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  updateStaffProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('../../../features/customers/api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

vi.mock('../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

function buildStaffProfile(
  overrides: Partial<StaffProfile> = {}
): StaffProfile {
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

function buildCustomerProfile() {
  return {
    id: 'customer-1',
    full_name: 'Jane Dela Cruz',
    contact_number: '09171234567',
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'jane@example.com',
    primary_auth_provider: 'email' as const,
    facebook_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('ProfileTab', () => {
  it('staff: renders the avatar, display name, contact fields, and comms preference', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildStaffProfile(),
      error: null,
    });

    render(
      createElement(ProfileTab, {
        role: 'staff',
        userId: 'staff-1',
        accessToken: 'token',
      })
    );

    expect(
      await screen.findByRole('heading', { name: 'Jamie Cruz' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Jamie Cruz');
    expect(screen.getByLabelText(/phone number/i)).toHaveValue('555-0100');
    expect(screen.getByLabelText(/preferred communication/i)).toHaveValue(
      'Text'
    );
  });

  it('staff: saving an edited field calls updateStaffProfile and reflects the update', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildStaffProfile(),
      error: null,
    });
    vi.mocked(staffApi.updateStaffProfile).mockResolvedValue({
      data: buildStaffProfile({ display_name: 'Jamie R. Cruz' }),
      error: null,
    });

    render(
      createElement(ProfileTab, {
        role: 'staff',
        userId: 'staff-1',
        accessToken: 'token',
      })
    );

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

  it('customer: renders profile fields from getCustomerProfile, with no pets section', async () => {
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: buildCustomerProfile(),
      error: null,
    });

    render(
      createElement(ProfileTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    expect(
      await screen.findByDisplayValue('Jane Dela Cruz')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument();
    expect(screen.queryByText(/my pets/i)).not.toBeInTheDocument();
  });

  it('customer: saving edits calls updateCustomerProfile and reflects the update', async () => {
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: buildCustomerProfile(),
      error: null,
    });
    vi.mocked(customerApi.updateCustomerProfile).mockResolvedValue({
      data: { ...buildCustomerProfile(), full_name: 'Jane Updated' },
      error: null,
    });

    render(
      createElement(ProfileTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    const nameInput = await screen.findByDisplayValue('Jane Dela Cruz');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Jane Updated');
    await userEvent.click(
      screen.getByRole('button', { name: /save profile/i })
    );

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(customerApi.updateCustomerProfile).toHaveBeenCalledWith(
      'customer-1',
      'token',
      expect.objectContaining({ full_name: 'Jane Updated' })
    );
  });
});
