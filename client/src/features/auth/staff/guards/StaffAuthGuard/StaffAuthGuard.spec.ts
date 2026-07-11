import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../../../../shared/api/mfa.api';
import { StaffAuthGuard } from './StaffAuthGuard';

vi.mock('../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
  enrollMfa: vi.fn().mockResolvedValue({
    data: { totp: { qr_code: null, uri: null } },
    error: null,
  }),
  verifyMfa: vi.fn(),
}));

function createAuthValue(
  overrides: Partial<AuthContextValue>
): AuthContextValue {
  return {
    session: null,
    user: null,
    accessToken: null,
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderGuard(authValue: AuthContextValue, initialPath = '/staff') {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(StaffAuthGuard) },
            createElement(Route, {
              path: '/staff',
              element: createElement('div', null, 'Protected staff area'),
            })
          ),
          createElement(Route, {
            path: '/staff/login',
            element: createElement('div', null, 'Login page'),
          }),
          createElement(Route, {
            path: '/staff/mfa/verify',
            element: createElement('div', null, 'MFA challenge'),
          })
        )
      )
    )
  );
}

describe('StaffAuthGuard', () => {
  beforeEach(() => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: null, mfa_enrolled: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it('redirects unauthenticated staff to login', () => {
    renderGuard(createAuthValue({}));

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('redirects MFA-pending staff to challenge', () => {
    window.sessionStorage.setItem('staffMfaPending', 'true');

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'admin@example.com' },
        },
        user: { id: 'user-1', email: 'admin@example.com', role: 'Admin' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(screen.getByText('MFA challenge')).toBeInTheDocument();
  });

  it('renders protected staff content for authenticated non-MFA staff', () => {
    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'staff@example.com' },
        },
        user: { id: 'user-1', email: 'staff@example.com', role: 'Groomer' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(screen.getByText('Protected staff area')).toBeInTheDocument();
  });

  it('shows the mandatory MFA setup popup for an Admin without an enrolled factor, without redirecting away', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: false },
      error: null,
    });

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'admin@example.com' },
        },
        user: { id: 'user-1', email: 'admin@example.com', role: 'Admin' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(
      await screen.findByRole('dialog', {
        name: /set up multi-factor authentication/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Protected staff area')).toBeInTheDocument();
  });

  it('redirects an already-enrolled Superadmin needing aal2 to the challenge page', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Superadmin', mfa_enrolled: true },
      error: null,
    });

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'super@example.com' },
        },
        user: { id: 'user-1', email: 'super@example.com', role: 'Superadmin' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(await screen.findByText('MFA challenge')).toBeInTheDocument();
  });

  it('never shows the MFA setup popup for a Supervisor, even when unenrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Supervisor', mfa_enrolled: false },
      error: null,
    });

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'supervisor@example.com' },
        },
        user: {
          id: 'user-1',
          email: 'supervisor@example.com',
          role: 'Supervisor',
        },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    await waitFor(() => expect(mfaApi.getMfaStatus).toHaveBeenCalled());
    expect(
      screen.queryByRole('dialog', {
        name: /set up multi-factor authentication/i,
      })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Protected staff area')).toBeInTheDocument();
  });

  // aal is a JWT claim, not a session.user field - encode a fake token whose
  // payload carries { aal: 'aal2' } so these unrelated timeout tests don't
  // get redirected to the MFA challenge page.
  const aal2Token = 'header.eyJhYWwiOiJhYWwyIn0=.sig';

  it('shows a session-expiry warning before the role threshold elapses', () => {
    vi.useFakeTimers();

    renderGuard(
      createAuthValue({
        session: {
          access_token: aal2Token,
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'admin@example.com' },
        },
        user: { id: 'user-1', email: 'admin@example.com', role: 'Admin' },
        accessToken: aal2Token,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });

    expect(
      screen.getByRole('dialog', { name: /staff session is about to expire/i })
    ).toBeInTheDocument();
  });

  it('signs staff out when the role threshold elapses', () => {
    vi.useFakeTimers();
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderGuard(
      createAuthValue({
        session: {
          access_token: aal2Token,
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'admin@example.com' },
        },
        user: { id: 'user-1', email: 'admin@example.com', role: 'Admin' },
        accessToken: aal2Token,
        signOut,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
