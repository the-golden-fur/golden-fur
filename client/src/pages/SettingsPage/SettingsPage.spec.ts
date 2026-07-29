import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../shared/api/mfa.api';
import * as staffApi from '../../features/staff/api/staff.api';
import * as customerApi from '../../features/customers/api/customer.api';
import { getSupabaseClient } from '../../shared/auth/api/auth.api';
import { SettingsPage } from './SettingsPage';

vi.mock('../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
  enrollMfa: vi.fn(),
  verifyMfa: vi.fn(),
  unenrollMfa: vi.fn(),
}));

vi.mock('../../features/staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  updateStaffProfile: vi.fn(),
  updateStaffUsername: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('../../features/customers/api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

vi.mock('../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

function renderPage(role: 'staff' | 'customer') {
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
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(SettingsPage, { role })
      )
    )
  );
}

async function goToSecurityTab() {
  await userEvent.click(await screen.findByRole('tab', { name: 'Security' }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: null,
      error: 'not needed for these tests',
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'not needed for these tests',
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('defaults to the Profile tab', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    expect(await screen.findByRole('tab', { name: 'Profile' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('hides the Config tab for a non-admin staff role', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    await screen.findByRole('tab', { name: 'Profile' });
    expect(
      screen.queryByRole('tab', { name: 'Config' })
    ).not.toBeInTheDocument();
  });

  it('shows the Config tab for an Admin', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    expect(
      await screen.findByRole('tab', { name: 'Config' })
    ).toBeInTheDocument();
  });

  it('hides the Config tab for a customer', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: false },
      error: null,
    });

    renderPage('customer');

    await screen.findByRole('tab', { name: 'Profile' });
    expect(
      screen.queryByRole('tab', { name: 'Config' })
    ).not.toBeInTheDocument();
  });

  it('shows an enabled confirmation when MFA is already set up', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    expect(
      await screen.findByText('MFA is enabled on your account.')
    ).toBeInTheDocument();
  });

  it('offers a Disable MFA action for an enrolled, non-mandatory role', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });
    vi.mocked(mfaApi.unenrollMfa).mockResolvedValue({
      data: { removed: ['factor-1'], failed: [] },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    const disableButton = await screen.findByRole('button', {
      name: /disable mfa/i,
    });
    await userEvent.click(disableButton);

    await waitFor(() =>
      expect(mfaApi.unenrollMfa).toHaveBeenCalledWith('staff', 'access')
    );
  });

  it('does not offer a Disable MFA action for a mandatory role that is already enrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    await screen.findByText('MFA is enabled on your account.');
    expect(
      screen.queryByRole('button', { name: /disable mfa/i })
    ).not.toBeInTheDocument();
  });

  it('shows an error and keeps MFA enrolled when unenroll fails (e.g. missing aal2)', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });
    vi.mocked(mfaApi.unenrollMfa).mockResolvedValue({
      data: null,
      error: 'Failed to remove MFA factor',
    });

    renderPage('staff');
    await goToSecurityTab();

    const disableButton = await screen.findByRole('button', {
      name: /disable mfa/i,
    });
    await userEvent.click(disableButton);

    expect(
      await screen.findByText('Failed to remove MFA factor')
    ).toBeInTheDocument();
  });

  it('offers optional setup for a lower-privilege staff role that is not enrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Cashier', mfa_enrolled: false },
      error: null,
    });
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { totp: { qr_code: null, uri: 'otpauth://totp/example' } },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    expect(
      await screen.findByText(/optional for your role/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /confirm mfa/i })
    ).toBeInTheDocument();
  });

  it('flags MFA as required but not yet set up for a mandatory staff role, without rendering its own enroll panel', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: false },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    expect(
      await screen.findByText(/required for your role/i)
    ).toBeInTheDocument();
    // The mandatory MfaSetupModal (rendered by StaffAuthGuard, not this page)
    // owns enrollment for Admin/Superadmin exclusively. A second enroll panel
    // here would race it - each instance's enrollMfa() call invalidates
    // whatever QR/key the user just scanned from the other one.
    expect(mfaApi.enrollMfa).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /confirm mfa/i })
    ).not.toBeInTheDocument();
  });

  it('offers optional setup for a customer that is not enrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: false },
      error: null,
    });
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { totp: { qr_code: null, uri: 'otpauth://totp/example' } },
      error: null,
    });

    renderPage('customer');
    await goToSecurityTab();

    await waitFor(() =>
      expect(mfaApi.getMfaStatus).toHaveBeenCalledWith('customer', 'access')
    );
    expect(
      await screen.findByText(/optional for your role/i)
    ).toBeInTheDocument();
  });
});
