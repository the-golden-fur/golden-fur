import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import { StaffAuthGuard } from './StaffAuthGuard';

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

  it('shows a session-expiry warning before the role threshold elapses', () => {
    vi.useFakeTimers();

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'admin@example.com', aal: 'aal2' },
        },
        user: { id: 'user-1', email: 'admin@example.com', role: 'Admin' },
        accessToken: 'access',
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
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'admin@example.com', aal: 'aal2' },
        },
        user: { id: 'user-1', email: 'admin@example.com', role: 'Admin' },
        accessToken: 'access',
        signOut,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
