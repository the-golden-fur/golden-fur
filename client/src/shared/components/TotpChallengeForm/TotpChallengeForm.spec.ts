import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../api/mfa.api';
import { TotpChallengeForm } from './TotpChallengeForm';

vi.mock('../../api/mfa.api', () => ({
  verifyMfa: vi.fn(),
  getMfaStatus: vi.fn(),
  requestMfaEmailCode: vi.fn(),
}));

vi.mock('../../auth/api/trustedDevice.api', () => ({
  storeDeviceToken: vi.fn(),
}));

function renderForm(onVerified = vi.fn(), applySession = vi.fn()) {
  const authValue: AuthContextValue = {
    session: null,
    user: null,
    accessToken: 'access',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession,
    signOut: vi.fn(),
  };

  return render(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(TotpChallengeForm, {
        role: 'customer',
        accessToken: 'access',
        onVerified,
      })
    )
  );
}

describe('TotpChallengeForm', () => {
  beforeEach(() => {
    vi.mocked(mfaApi.verifyMfa).mockReset();
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: {
        mfa_enrolled: true,
        methods: { authenticator: true, email: false },
        preferred_method: 'authenticator',
      },
      error: null,
    });
    vi.mocked(mfaApi.requestMfaEmailCode).mockReset();
  });

  it('applies the refreshed session and calls onVerified on a correct code', async () => {
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref' },
      error: null,
    });
    const applySession = vi.fn().mockResolvedValue(undefined);
    const onVerified = vi.fn();

    renderForm(onVerified, applySession);

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(mfaApi.verifyMfa).toHaveBeenCalledWith(
      'customer',
      '123456',
      'access',
      {
        method: 'authenticator',
        rememberDevice: false,
      }
    );
    await waitFor(() =>
      expect(applySession).toHaveBeenCalledWith('new-acc', 'new-ref')
    );
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('asks up front which method to use when both are enrolled, and sends a fresh code for email', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: {
        mfa_enrolled: true,
        methods: { authenticator: true, email: true },
        preferred_method: 'authenticator',
      },
      error: null,
    });
    vi.mocked(mfaApi.requestMfaEmailCode).mockResolvedValue({
      data: { sent: true },
      error: null,
    });

    renderForm();

    expect(
      await screen.findByText('How would you like to verify?')
    ).toBeInTheDocument();
    // Choosing up front means the code-entry form (and its "Digit 1 of 6"
    // input) hasn't rendered yet.
    expect(screen.queryByLabelText('Digit 1 of 6')).not.toBeInTheDocument();

    const emailButton = screen.getByRole('button', {
      name: /email me a code/i,
    });
    await userEvent.click(emailButton);

    expect(mfaApi.requestMfaEmailCode).toHaveBeenCalledWith(
      'customer',
      'access'
    );
    expect(
      await screen.findByText('We emailed you a 6-digit code.')
    ).toBeInTheDocument();
  });

  it('skips the up-front choice entirely when only one method is enrolled', async () => {
    renderForm();

    await screen.findByLabelText('Digit 1 of 6');
    expect(
      screen.queryByText('How would you like to verify?')
    ).not.toBeInTheDocument();
  });

  it('lets the user switch methods after already choosing one, via "Other ways to verify"', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: {
        mfa_enrolled: true,
        methods: { authenticator: true, email: true },
        preferred_method: 'authenticator',
      },
      error: null,
    });
    vi.mocked(mfaApi.requestMfaEmailCode).mockResolvedValue({
      data: { sent: true },
      error: null,
    });

    renderForm();

    const authenticatorButton = await screen.findByRole('button', {
      name: /use my authenticator app/i,
    });
    await userEvent.click(authenticatorButton);
    await screen.findByLabelText('Digit 1 of 6');

    const emailButton = screen.getByRole('button', {
      name: /use my email/i,
    });
    await userEvent.click(emailButton);

    expect(mfaApi.requestMfaEmailCode).toHaveBeenCalledWith(
      'customer',
      'access'
    );
    expect(
      await screen.findByText('We emailed you a 6-digit code.')
    ).toBeInTheDocument();
  });

  it('sends remember_device: true when the checkbox is checked', async () => {
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref' },
      error: null,
    });

    renderForm();

    await userEvent.click(
      screen.getByLabelText(/remember this device for 30 days/i)
    );
    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(mfaApi.verifyMfa).toHaveBeenCalledWith(
      'customer',
      '123456',
      'access',
      {
        method: 'authenticator',
        rememberDevice: true,
      }
    );
  });

  it('hides the "remember this device" checkbox entirely for a mandatory-MFA role', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: {
        role: 'Admin',
        mfa_enrolled: true,
        methods: { authenticator: true, email: false },
        preferred_method: 'authenticator',
      },
      error: null,
    });

    renderForm();

    await screen.findByLabelText('Digit 1 of 6');
    expect(
      screen.queryByLabelText(/remember this device for 30 days/i)
    ).not.toBeInTheDocument();
  });

  it('regression: re-enables Verify code and shows an error instead of freezing when a downstream step throws (e.g. a network blip inside applySession)', async () => {
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref' },
      error: null,
    });
    const applySession = vi.fn().mockRejectedValue(new Error('network blip'));

    renderForm(vi.fn(), applySession);

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the server. Check your connection and try again.'
    );
    expect(
      screen.getByRole('button', { name: /verify code/i })
    ).not.toBeDisabled();
  });

  it('shows the server error and does not call onVerified for an incorrect code', async () => {
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: null,
      error: 'Invalid code',
    });
    const onVerified = vi.fn();

    renderForm(onVerified);

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid code');
    expect(onVerified).not.toHaveBeenCalled();
  });
});
