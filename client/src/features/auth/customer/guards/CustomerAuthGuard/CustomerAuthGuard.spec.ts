import { render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../../../../shared/api/mfa.api';
import * as preferencesApi from '../../../../../shared/api/preferences.api';
import * as customerApi from '../../../../customers/api/customer.api';
import { CustomerAuthGuard } from './CustomerAuthGuard';

vi.mock('../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
}));

vi.mock('../../../../../shared/api/preferences.api', () => ({
  hasProfile: vi.fn(),
}));

vi.mock('../../../../customers/api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
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
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderGuard(authValue: AuthContextValue, initialPath = '/portal') {
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
            { element: createElement(CustomerAuthGuard) },
            createElement(Route, {
              path: '/portal',
              element: createElement('div', null, 'Customer portal'),
            })
          ),
          createElement(Route, {
            path: '/login',
            element: createElement('div', null, 'Login page'),
          }),
          createElement(Route, {
            path: '/portal/mfa/verify',
            element: createElement('div', null, 'MFA challenge'),
          })
        )
      )
    )
  );
}

describe('CustomerAuthGuard', () => {
  beforeEach(() => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: false },
      error: null,
    });
    vi.mocked(preferencesApi.hasProfile).mockResolvedValue(true);
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: null,
      error: null,
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('redirects unauthenticated customers to login', () => {
    renderGuard(createAuthValue({}));

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders protected portal content for a customer without MFA enrolled', async () => {
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
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    await waitFor(() => expect(mfaApi.getMfaStatus).toHaveBeenCalled());
    expect(screen.getByText('Customer portal')).toBeInTheDocument();
  });

  it('renders the identity chip (full name, no role badge) and the portal sidebar', async () => {
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: {
        id: 'user-1',
        full_name: 'Jane Doe',
        contact_number: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        preferred_communication_channel: null,
        account_email: 'jane@example.com',
        primary_auth_provider: 'email',
        facebook_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

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
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(primaryNav).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('href', '/portal/settings');
    expect(screen.getByRole('link', { name: 'Pet Manager' })).toHaveAttribute(
      'href',
      '/portal/pets'
    );
  });

  it('redirects an enrolled customer needing aal2 to the challenge page', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: true },
      error: null,
    });

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
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(await screen.findByText('MFA challenge')).toBeInTheDocument();
  });

  it('honors the customerMfaPending flag immediately, without waiting on the status fetch', () => {
    window.sessionStorage.setItem('customerMfaPending', 'true');

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
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    expect(screen.getByText('MFA challenge')).toBeInTheDocument();
  });

  it('does not redirect an already-aal2 enrolled customer', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: true },
      error: null,
    });

    // aal is a JWT claim, not a session.user field - encode a fake token
    // whose payload carries { aal: 'aal2' }.
    const aal2Token = 'header.eyJhYWwiOiJhYWwyIn0=.sig';

    renderGuard(
      createAuthValue({
        session: {
          access_token: aal2Token,
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'customer@example.com' },
        },
        user: { id: 'user-1', email: 'customer@example.com' },
        accessToken: aal2Token,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    await waitFor(() => expect(mfaApi.getMfaStatus).toHaveBeenCalled());
    expect(screen.getByText('Customer portal')).toBeInTheDocument();
  });

  it('signs out and redirects to login when the session has no customer_profiles row (cross-role session)', async () => {
    vi.mocked(preferencesApi.hasProfile).mockResolvedValue(false);
    const signOut = vi.fn().mockResolvedValue(undefined);

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
        signOut,
      } as Partial<AuthContextValue> as AuthContextValue)
    );

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Customer portal')).not.toBeInTheDocument();
  });
});
