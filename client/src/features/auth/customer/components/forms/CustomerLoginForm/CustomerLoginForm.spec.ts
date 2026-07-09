import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CustomerLoginForm } from './CustomerLoginForm';
import * as customerAuthApi from '../../../api/customerAuth.api';
import * as mfaApi from '../../../../../../shared/api/mfa.api';

vi.mock('../../../api/customerAuth.api', () => ({
  login: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithFacebook: vi.fn(),
}));

vi.mock('../../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
}));

function renderForm(applySession = vi.fn()) {
  const authValue: AuthContextValue = {
    session: null,
    user: null,
    accessToken: null,
    isLoading: false,
    refreshSession: vi.fn(),
    applySession,
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(CustomerLoginForm)
      )
    )
  );
}

describe('CustomerLoginForm', () => {
  const loginMock = vi.mocked(customerAuthApi.login);
  const getMfaStatusMock = vi.mocked(mfaApi.getMfaStatus);

  beforeEach(() => {
    loginMock.mockReset();
    getMfaStatusMock.mockReset();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('shows an inline error for wrong credentials', async () => {
    loginMock.mockResolvedValue({ data: null, error: 'Unauthorized' });

    renderForm();

    await userEvent.type(
      screen.getByLabelText(/email/i),
      'customer@example.com'
    );
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.'
    );
  });

  it('marks MFA pending after login when the customer has already enrolled', async () => {
    const applySession = vi.fn().mockResolvedValue(undefined);
    loginMock.mockResolvedValue({
      data: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 },
      error: null,
    });
    getMfaStatusMock.mockResolvedValue({
      data: { mfa_enrolled: true },
      error: null,
    });

    renderForm(applySession);

    await userEvent.type(
      screen.getByLabelText(/email/i),
      'customer@example.com'
    );
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-pw');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(applySession).toHaveBeenCalledWith('acc', 'ref')
    );
    await waitFor(() =>
      expect(getMfaStatusMock).toHaveBeenCalledWith('customer', 'acc')
    );
    await waitFor(() =>
      expect(window.sessionStorage.getItem('customerMfaPending')).toBe('true')
    );
  });

  it('does not mark MFA pending for a customer who never enrolled', async () => {
    const applySession = vi.fn().mockResolvedValue(undefined);
    loginMock.mockResolvedValue({
      data: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 },
      error: null,
    });
    getMfaStatusMock.mockResolvedValue({
      data: { mfa_enrolled: false },
      error: null,
    });

    renderForm(applySession);

    await userEvent.type(
      screen.getByLabelText(/email/i),
      'customer@example.com'
    );
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-pw');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(getMfaStatusMock).toHaveBeenCalled());
    expect(window.sessionStorage.getItem('customerMfaPending')).toBeNull();
  });
});
