import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CustomerLoginForm } from './CustomerLoginForm';
import * as customerAuthApi from '../../../api/customerAuth.api';
import * as mfaApi from '../../../../../../shared/api/mfa.api';

vi.mock('../../../api/customerAuth.api', () => ({
  login: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
}));

/** Stands in for the portal and shows the router state it was reached
 * with - the tutorial only auto-starts on `justRegistered`. */
function PortalProbe() {
  const location = useLocation();
  return createElement(
    'div',
    null,
    'Customer portal',
    createElement(
      'span',
      { 'data-testid': 'portal-state' },
      JSON.stringify(location.state)
    )
  );
}

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
      { initialEntries: ['/login'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/login',
            element: createElement(CustomerLoginForm),
          }),
          createElement(Route, {
            path: '/account-deactivated',
            element: createElement('div', null, 'Deactivated notice'),
          }),
          createElement(Route, {
            path: '/portal',
            element: createElement(PortalProbe),
          })
        )
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

  it('regression: re-enables Sign in and shows an error instead of freezing when a downstream step throws (e.g. a network blip inside applySession)', async () => {
    const applySession = vi.fn().mockRejectedValue(new Error('network blip'));
    loginMock.mockResolvedValue({
      data: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 },
      error: null,
    });

    renderForm(applySession);

    await userEvent.type(
      screen.getByLabelText(/email/i),
      'customer@example.com'
    );
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-pw');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the server. Check your connection and try again.'
    );
    expect(
      screen.getByRole('button', { name: /^sign in$/i })
    ).not.toBeDisabled();
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

  it('routes a deactivated account to the notice page instead of the portal/MFA flow', async () => {
    const applySession = vi.fn().mockResolvedValue(undefined);
    loginMock.mockResolvedValue({
      data: {
        access_token: 'acc',
        refresh_token: 'ref',
        expires_in: 3600,
        account_status: 'deactivated',
      },
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
    expect(await screen.findByText('Deactivated notice')).toBeInTheDocument();
    expect(getMfaStatusMock).not.toHaveBeenCalled();
  });

  it('a login lands on the portal without the justRegistered flag, so the tutorial does not start', async () => {
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

    expect(await screen.findByText('Customer portal')).toBeInTheDocument();
    expect(screen.getByTestId('portal-state')).not.toHaveTextContent(
      'justRegistered'
    );
  });
});
