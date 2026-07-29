import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../../../../shared/api/mfa.api';
import * as staffApi from '../../../../staff/api/staff.api';
import type { StaffProfile } from '../../../../staff/staff.types';
import { StaffAuthGuard } from './StaffAuthGuard';

vi.mock('../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
  enrollMfa: vi.fn().mockResolvedValue({
    data: { totp: { qr_code: null, uri: null } },
    error: null,
  }),
  verifyMfa: vi.fn(),
}));

vi.mock('../../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

function buildProfile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'user-1',
    branch_id: 'branch-1',
    role: 'Groomer',
    username: 'user1',
    registered_email: 'user1@example.com',
    display_name: 'Test User',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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
    signOut: vi.fn().mockResolvedValue(undefined),
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
    // Default: role unresolved (null data). Tests that depend on a specific
    // role (mandatory MFA, timeout tier) override this explicitly - role
    // comes from the server (getStaffProfile), never from the session/JWT.
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: null,
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

  it('signs out and redirects to login when GET /staff/:id 403s (cross-role session, e.g. a customer reaching /staff)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: null,
      error: 'Forbidden',
    });
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'customer@example.com' },
        },
        user: { id: 'user-1', email: 'customer@example.com' },
        accessToken: 'access',
        signOut,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected staff area')).not.toBeInTheDocument();
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
        user: { id: 'user-1', email: 'admin@example.com' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(screen.getByText('MFA challenge')).toBeInTheDocument();
  });

  it('renders protected staff content for authenticated non-MFA staff', async () => {
    // "non-MFA staff" means not enrolled - the beforeEach default of
    // mfa_enrolled: true doesn't fit this test's own name/intent, and would
    // otherwise correctly redirect to the aal2 challenge once settled (see
    // the "Mandatory roles..." comment in StaffAuthGuard).
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: false },
      error: null,
    });
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Groomer' }),
      error: null,
    });

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'staff@example.com' },
        },
        user: { id: 'user-1', email: 'staff@example.com' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(await screen.findByText('Protected staff area')).toBeInTheDocument();
  });

  it('renders the identity chip (username + role) and a role-appropriate sidebar', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: false },
      error: null,
    });
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Groomer', username: 'gwash' }),
      error: null,
    });

    renderGuard(
      createAuthValue({
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'staff@example.com' },
        },
        user: { id: 'user-1', email: 'staff@example.com' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(await screen.findByText('gwash')).toBeInTheDocument();
    expect(
      screen.getByText('Groomer', { selector: 'span' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Grooming Queue' })
    ).toHaveAttribute('href', '/staff/grooming/queue');
  });

  it('shows the mandatory MFA setup popup for an Admin without an enrolled factor, without redirecting away', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: false },
      error: null,
    });
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Admin' }),
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
        user: { id: 'user-1', email: 'admin@example.com' },
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
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Superadmin' }),
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
        user: { id: 'user-1', email: 'super@example.com' },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(await screen.findByText('MFA challenge')).toBeInTheDocument();
  });

  it('shows the mandatory MFA setup popup for an unenrolled Supervisor (spec requires Admin + Supervisor)', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Supervisor', mfa_enrolled: false },
      error: null,
    });
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Supervisor' }),
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
        },
        accessToken: 'access',
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(
      await screen.findByRole('dialog', {
        name: /set up multi-factor authentication/i,
      })
    ).toBeInTheDocument();
  });

  // aal is a JWT claim, not a session.user field - encode a fake token whose
  // payload carries { aal: 'aal2' } so these unrelated timeout tests don't
  // get redirected to the MFA challenge page.
  const aal2Token = 'header.eyJhYWwiOiJhYWwyIn0=.sig';

  it('shows a session-expiry warning before the role threshold elapses', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Admin' }),
      error: null,
    });
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
        user: { id: 'user-1', email: 'admin@example.com' },
        accessToken: aal2Token,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    // Flush the pending getStaffProfile() microtask (and its setRole update)
    // before advancing fake timers, so the 30-minute Admin threshold is
    // already in effect when the clock moves - fake timers don't fake
    // native Promise microtasks, so this resolves independently of them.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });

    expect(
      screen.getByRole('dialog', { name: /staff session is about to expire/i })
    ).toBeInTheDocument();
  });

  it('signs staff out when the role threshold elapses', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Admin' }),
      error: null,
    });
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
        user: { id: 'user-1', email: 'admin@example.com' },
        accessToken: aal2Token,
        signOut,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
