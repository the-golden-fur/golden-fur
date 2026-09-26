import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  getLinkedProviders: vi.fn(),
  unlinkGoogleIdentity: vi.fn(),
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
  beforeEach(() => {
    // Default: no Google identity linked, so GoogleAccountForm renders
    // nothing unless a test opts in below - matches most fixtures here,
    // which build email/password accounts.
    vi.mocked(customerAuthApi.getLinkedProviders).mockResolvedValue({
      data: { providers: ['email'] },
      error: null,
    });
  });

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

  it('customer: shows no Google section when no Google account is linked', async () => {
    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    await screen.findByRole('button', { name: /update password/i });
    expect(
      screen.queryByRole('heading', { name: /google account/i })
    ).not.toBeInTheDocument();
  });

  it('staff: never shows a Google section', async () => {
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

    await screen.findByLabelText(/^username$/i);
    expect(
      screen.queryByRole('heading', { name: /google account/i })
    ).not.toBeInTheDocument();
    expect(customerAuthApi.getLinkedProviders).not.toHaveBeenCalled();
  });

  it('customer: Google linked alongside a password shows an active Unlink button', async () => {
    vi.mocked(customerAuthApi.getLinkedProviders).mockResolvedValue({
      data: { providers: ['email', 'google'] },
      error: null,
    });

    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    expect(
      await screen.findByRole('button', { name: /unlink google/i })
    ).toBeEnabled();
  });

  it('customer: unlinking Google calls unlinkGoogleIdentity and hides the section on success', async () => {
    vi.mocked(customerAuthApi.getLinkedProviders).mockResolvedValue({
      data: { providers: ['email', 'google'] },
      error: null,
    });
    vi.mocked(customerAuthApi.unlinkGoogleIdentity).mockResolvedValue({
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

    await userEvent.click(
      await screen.findByRole('button', { name: /unlink google/i })
    );

    await waitFor(() =>
      expect(customerAuthApi.unlinkGoogleIdentity).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /google account/i })
      ).not.toBeInTheDocument()
    );
  });

  it('customer: shows the unlink error inline instead of hiding the section', async () => {
    vi.mocked(customerAuthApi.getLinkedProviders).mockResolvedValue({
      data: { providers: ['email', 'google'] },
      error: null,
    });
    vi.mocked(customerAuthApi.unlinkGoogleIdentity).mockResolvedValue({
      data: null,
      error: 'Something went wrong',
    });

    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    await userEvent.click(
      await screen.findByRole('button', { name: /unlink google/i })
    );

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /unlink google/i })
    ).toBeInTheDocument();
  });

  it('customer: Google as the only linked identity disables Unlink with guidance to link Facebook first', async () => {
    // Regression test: setting a password does NOT satisfy Supabase's
    // "2+ identities" requirement for unlinkIdentity() (updateUser({
    // password }) never adds an `email` row to auth.identities - see
    // supabase/auth#2085), so the guidance must not tell the customer that
    // a password unlocks unlinking.
    vi.mocked(customerAuthApi.getLinkedProviders).mockResolvedValue({
      data: { providers: ['google'] },
      error: null,
    });

    render(
      createElement(AccountTab, {
        role: 'customer',
        userId: 'customer-1',
        accessToken: 'token',
      })
    );

    await screen.findByRole('heading', { name: /google account/i });
    expect(
      screen.queryByRole('button', { name: /unlink google/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/set a password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/link a facebook account/i)).toBeInTheDocument();
  });
});
