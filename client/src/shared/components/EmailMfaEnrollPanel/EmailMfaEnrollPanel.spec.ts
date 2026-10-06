import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../api/mfa.api';
import { EmailMfaEnrollPanel } from './EmailMfaEnrollPanel';

vi.mock('../../api/mfa.api', () => ({
  enrollMfa: vi.fn(),
  requestMfaEmailCode: vi.fn(),
  verifyMfa: vi.fn(),
  unenrollMfa: vi.fn(),
}));

function renderPanel(
  onEnrolled = vi.fn(),
  onError = vi.fn(),
  applySession = vi.fn()
) {
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
      createElement(EmailMfaEnrollPanel, {
        role: 'staff',
        accessToken: 'access',
        onEnrolled,
        onError,
      })
    )
  );
}

describe('EmailMfaEnrollPanel', () => {
  beforeEach(() => {
    vi.mocked(mfaApi.enrollMfa).mockReset();
    vi.mocked(mfaApi.requestMfaEmailCode).mockReset();
    vi.mocked(mfaApi.verifyMfa).mockReset();
    vi.mocked(mfaApi.unenrollMfa).mockReset();
  });

  it('enrolls the email method on mount (no QR/secret to show)', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { id: 'email-factor', sent: true },
      error: null,
    });

    renderPanel();

    await waitFor(() =>
      expect(mfaApi.enrollMfa).toHaveBeenCalledWith('staff', 'access', 'email')
    );
    expect(screen.queryByAltText(/qr code/i)).not.toBeInTheDocument();
  });

  it('resends a code on demand', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { id: 'email-factor', sent: true },
      error: null,
    });
    vi.mocked(mfaApi.requestMfaEmailCode).mockResolvedValue({
      data: { sent: true },
      error: null,
    });

    renderPanel();
    await waitFor(() => expect(mfaApi.enrollMfa).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /resend code/i }));

    await waitFor(() =>
      expect(mfaApi.requestMfaEmailCode).toHaveBeenCalledWith('staff', 'access')
    );
    expect(
      await screen.findByText('A new code was sent to your email.')
    ).toBeInTheDocument();
  });

  it('applies the refreshed session and calls onEnrolled on a correct code', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { id: 'email-factor', sent: true },
      error: null,
    });
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref' },
      error: null,
    });
    const applySession = vi.fn().mockResolvedValue(undefined);
    const onEnrolled = vi.fn();

    renderPanel(onEnrolled, vi.fn(), applySession);
    await waitFor(() => expect(mfaApi.enrollMfa).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm mfa/i }));

    await waitFor(() =>
      expect(mfaApi.verifyMfa).toHaveBeenCalledWith(
        'staff',
        '123456',
        'access',
        {
          method: 'email',
        }
      )
    );
    await waitFor(() =>
      expect(applySession).toHaveBeenCalledWith('new-acc', 'new-ref')
    );
    expect(onEnrolled).toHaveBeenCalledTimes(1);
  });

  it('calls onError when verify fails', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { id: 'email-factor', sent: true },
      error: null,
    });
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: null,
      error: 'Invalid code',
    });
    const onError = vi.fn();

    renderPanel(vi.fn(), onError);
    await waitFor(() => expect(mfaApi.enrollMfa).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm mfa/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Invalid code'));
  });

  it('offers a "Start over" action that unenrolls and re-enrolls after an error', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { id: 'email-factor', sent: true },
      error: null,
    });
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: null,
      error: 'Invalid code',
    });
    vi.mocked(mfaApi.unenrollMfa).mockResolvedValue({
      data: { removed: true },
      error: null,
    });

    renderPanel();
    await waitFor(() => expect(mfaApi.enrollMfa).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm mfa/i }));
    await screen.findByText('Invalid code');

    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    await waitFor(() =>
      expect(mfaApi.unenrollMfa).toHaveBeenCalledWith(
        'staff',
        'access',
        'email'
      )
    );
    await waitFor(() => expect(mfaApi.enrollMfa).toHaveBeenCalledTimes(2));
  });
});
