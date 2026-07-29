import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as staffApi from '../../../features/staff/api/staff.api';
import * as staffAuthApi from '../../../features/auth/staff/api/staffAuth.api';
import * as customerAuthApi from '../../../features/auth/customer/api/customerAuth.api';
import type { StaffProfile } from '../../../features/staff/staff.types';
import { AccountTab } from './AccountTab';

vi.mock('../../../features/staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  updateStaffUsername: vi.fn(),
}));

vi.mock('../../../features/auth/staff/api/staffAuth.api', () => ({
  updateStaffPassword: vi.fn(),
}));

vi.mock('../../../features/auth/customer/api/customerAuth.api', () => ({
  updateCustomerPassword: vi.fn(),
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

describe('AccountTab', () => {
  it('staff: shows a username field prefilled from getStaffProfile, plus a password form', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildStaffProfile(),
      error: null,
    });

    render(
      createElement(AccountTab, {
        role: 'staff',
        userId: 'staff-1',
        accessToken: 'token',
      })
    );

    expect(await screen.findByLabelText(/^username$/i)).toHaveValue('jcruz');
    expect(
      screen.getByRole('button', { name: /update password/i })
    ).toBeInTheDocument();
  });

  it('staff: saving a new username calls updateStaffUsername and shows success', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildStaffProfile(),
      error: null,
    });
    vi.mocked(staffApi.updateStaffUsername).mockResolvedValue({
      data: buildStaffProfile({ username: 'jamiec' }),
      error: null,
    });

    render(
      createElement(AccountTab, {
        role: 'staff',
        userId: 'staff-1',
        accessToken: 'token',
      })
    );

    const usernameInput = await screen.findByLabelText(/^username$/i);
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, 'jamiec');
    await userEvent.click(
      screen.getByRole('button', { name: /save username/i })
    );

    await waitFor(() =>
      expect(staffApi.updateStaffUsername).toHaveBeenCalledWith(
        'staff-1',
        'token',
        'jamiec'
      )
    );
    expect(await screen.findByText('Username updated.')).toBeInTheDocument();
  });

  it('staff: shows a friendly error when the username is already taken', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildStaffProfile(),
      error: null,
    });
    vi.mocked(staffApi.updateStaffUsername).mockResolvedValue({
      data: null,
      error: 'Username already exists',
    });

    render(
      createElement(AccountTab, {
        role: 'staff',
        userId: 'staff-1',
        accessToken: 'token',
      })
    );

    await screen.findByLabelText(/^username$/i);
    await userEvent.click(
      screen.getByRole('button', { name: /save username/i })
    );

    expect(
      await screen.findByText('Username already exists')
    ).toBeInTheDocument();
  });

  it('customer: has no username field, only a password form', async () => {
    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    expect(screen.queryByLabelText(/^username$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /update password/i })
    ).toBeInTheDocument();
  });

  it('rejects a password change when the confirmation does not match', async () => {
    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    await userEvent.type(
      screen.getByLabelText(/^new password$/i),
      'longenough1'
    );
    await userEvent.type(
      screen.getByLabelText(/confirm new password/i),
      'different1'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i })
    );

    expect(
      await screen.findByText('Passwords do not match')
    ).toBeInTheDocument();
    expect(customerAuthApi.updateCustomerPassword).not.toHaveBeenCalled();
  });

  it('customer: submitting a valid password calls updateCustomerPassword', async () => {
    vi.mocked(customerAuthApi.updateCustomerPassword).mockResolvedValue({
      data: null,
      error: null,
    });

    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    await userEvent.type(
      screen.getByLabelText(/^new password$/i),
      'longenough1'
    );
    await userEvent.type(
      screen.getByLabelText(/confirm new password/i),
      'longenough1'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i })
    );

    await waitFor(() =>
      expect(customerAuthApi.updateCustomerPassword).toHaveBeenCalledWith(
        'longenough1'
      )
    );
    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
  });

  it('staff: submitting a valid password calls updateStaffPassword (not the customer variant)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildStaffProfile(),
      error: null,
    });
    vi.mocked(staffAuthApi.updateStaffPassword).mockResolvedValue({
      data: null,
      error: null,
    });

    render(
      createElement(AccountTab, {
        role: 'staff',
        userId: 'staff-1',
        accessToken: 'token',
      })
    );

    await screen.findByLabelText(/^username$/i);
    await userEvent.type(
      screen.getByLabelText(/^new password$/i),
      'longenough1'
    );
    await userEvent.type(
      screen.getByLabelText(/confirm new password/i),
      'longenough1'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /update password/i })
    );

    await waitFor(() =>
      expect(staffAuthApi.updateStaffPassword).toHaveBeenCalledWith(
        'longenough1'
      )
    );
    expect(customerAuthApi.updateCustomerPassword).not.toHaveBeenCalled();
  });
});
