import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../api/mfa.api';
import { TotpEnrollPanel } from './TotpEnrollPanel';

vi.mock('../../api/mfa.api', () => ({
  enrollMfa: vi.fn(),
  verifyMfa: vi.fn(),
  unenrollMfa: vi.fn(),
}));

function renderPanel(
  onEnrolled = vi.fn(),
  applySession = vi.fn(),
  strict = false
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

  const tree = createElement(
    AuthContext.Provider,
    { value: authValue },
    createElement(TotpEnrollPanel, {
      role: 'staff',
      accessToken: 'access',
      onEnrolled,
    })
  );

  return render(strict ? createElement(StrictMode, null, tree) : tree);
}

describe('TotpEnrollPanel', () => {
  beforeEach(() => {
    vi.mocked(mfaApi.enrollMfa).mockReset();
    vi.mocked(mfaApi.verifyMfa).mockReset();
    vi.mocked(mfaApi.unenrollMfa).mockReset();
  });

  it('enrolls exactly once even under StrictMode double-invoked effects', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: {
        totp: { qr_code: 'data:image/png;base64,abc', secret: 'ABCD1234' },
      },
      error: null,
    });

    renderPanel(vi.fn(), vi.fn(), true);

    await screen.findByAltText('MFA enrollment QR code');
    expect(mfaApi.enrollMfa).toHaveBeenCalledTimes(1);
  });

  it('shows the QR code and a manual entry key with a copy button', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: {
        totp: { qr_code: 'data:image/png;base64,abc', secret: 'ABCD1234' },
      },
      error: null,
    });

    renderPanel();

    expect(
      await screen.findByAltText('MFA enrollment QR code')
    ).toBeInTheDocument();
    expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('applies the refreshed session and calls onEnrolled on successful verify', async () => {
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { totp: { qr_code: null, secret: 'ABCD1234' } },
      error: null,
    });
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref' },
      error: null,
    });
    const applySession = vi.fn().mockResolvedValue(undefined);
    const onEnrolled = vi.fn();

    renderPanel(onEnrolled, applySession);

    await screen.findByText('ABCD1234');
    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm mfa/i }));

    await waitFor(() =>
      expect(applySession).toHaveBeenCalledWith('new-acc', 'new-ref')
    );
    expect(onEnrolled).toHaveBeenCalledTimes(1);
  });

  it('offers a "Start over" action that unenrolls and re-enrolls after an enroll error', async () => {
    vi.mocked(mfaApi.enrollMfa)
      .mockResolvedValueOnce({
        data: null,
        error:
          'A factor with the friendly name "" for this user already exists',
      })
      .mockResolvedValueOnce({
        data: { totp: { qr_code: null, secret: 'FRESH-KEY' } },
        error: null,
      });
    vi.mocked(mfaApi.unenrollMfa).mockResolvedValue({
      data: { removed: [], failed: [] },
      error: null,
    });

    renderPanel();

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    await waitFor(() =>
      expect(mfaApi.unenrollMfa).toHaveBeenCalledWith('staff', 'access')
    );
    await waitFor(() => expect(mfaApi.enrollMfa).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('FRESH-KEY')).toBeInTheDocument();
  });
});
