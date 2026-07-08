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
  });

  it('applies the refreshed session and calls onVerified on a correct code', async () => {
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref' },
      error: null,
    });
    const applySession = vi.fn().mockResolvedValue(undefined);
    const onVerified = vi.fn();

    renderForm(onVerified, applySession);

    await userEvent.type(screen.getByLabelText(/6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(mfaApi.verifyMfa).toHaveBeenCalledWith('customer', '123456', 'access');
    await waitFor(() =>
      expect(applySession).toHaveBeenCalledWith('new-acc', 'new-ref')
    );
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('shows the server error and does not call onVerified for an incorrect code', async () => {
    vi.mocked(mfaApi.verifyMfa).mockResolvedValue({
      data: null,
      error: 'Invalid code',
    });
    const onVerified = vi.fn();

    renderForm(onVerified);

    await userEvent.type(screen.getByLabelText(/6-digit code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid code');
    expect(onVerified).not.toHaveBeenCalled();
  });
});
