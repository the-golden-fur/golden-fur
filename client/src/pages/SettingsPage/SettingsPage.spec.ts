import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../shared/api/mfa.api';
import { SettingsPage } from './SettingsPage';

vi.mock('../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
  enrollMfa: vi.fn(),
  verifyMfa: vi.fn(),
  unenrollMfa: vi.fn(),
}));

function renderPage(role: 'staff' | 'customer', signOut = vi.fn()) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut,
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

describe('SettingsPage', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('signs out and clears MFA pending flags when Sign out is clicked', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });
    window.sessionStorage.setItem('staffMfaPending', 'true');
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderPage('staff', signOut);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('staffMfaPending')).toBeNull();
  });

  it('shows an enabled confirmation when MFA is already set up', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

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

    await waitFor(() =>
      expect(mfaApi.getMfaStatus).toHaveBeenCalledWith('customer', 'access')
    );
    expect(
      await screen.findByText(/optional for your role/i)
    ).toBeInTheDocument();
  });
});
