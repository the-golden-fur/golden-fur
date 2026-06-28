import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import * as authApi from '../../api/auth.api';

vi.mock('../../api/auth.api', () => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
}));

function AuthProbe() {
  const { session, user, accessToken, isLoading, refreshSession } = useAuth();

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="session">{session ? 'session' : 'none'}</span>
      <span data-testid="user">{user ? (user.email ?? 'user') : 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
      <button type="button" onClick={() => void refreshSession()}>
        refresh
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  const mockGetSession = vi.mocked(authApi.getSession);
  const mockOnAuthStateChange = vi.mocked(authApi.onAuthStateChange);
  const mockRefreshSession = vi.mocked(authApi.refreshSession);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
      error: null,
    } as never);
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);
  });

  it('exposes signed-in auth state from the shared context', async () => {
    const signedInSession = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-1',
        email: 'jane@example.com',
      },
    };

    mockGetSession.mockResolvedValue({
      data: { session: signedInSession },
      error: null,
    } as never);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
    expect(screen.getByTestId('session')).toHaveTextContent('session');
    expect(screen.getByTestId('user')).toHaveTextContent('jane@example.com');
    expect(screen.getByTestId('token')).toHaveTextContent('access-token');
  });

  it('exposes signed-out auth state when no session exists', async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
    expect(screen.getByTestId('session')).toHaveTextContent('none');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
  });

  it('refreshes auth state when a new session is returned', async () => {
    const initialSession = {
      access_token: 'old-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-1',
        email: 'jane@example.com',
      },
    };

    const refreshedSession = {
      ...initialSession,
      access_token: 'new-token',
      user: {
        ...initialSession.user,
        email: 'jane+updated@example.com',
      },
    };

    mockGetSession.mockResolvedValue({
      data: { session: initialSession },
      error: null,
    } as never);
    mockRefreshSession.mockResolvedValue({
      data: { session: refreshedSession },
      error: null,
    } as never);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('old-token')
    );

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('new-token')
    );
    expect(screen.getByTestId('user')).toHaveTextContent(
      'jane+updated@example.com'
    );
  });
});
