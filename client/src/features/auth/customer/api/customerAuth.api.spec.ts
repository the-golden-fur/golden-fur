import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import { handleOAuthCallback, signInWithGoogle } from './customerAuth.api';

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

describe('customerAuth.api', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const getSessionMock = vi.fn();
  const signInWithOAuthMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    getSessionMock.mockReset();
    signInWithOAuthMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.clear();

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: getSessionMock,
        signInWithOAuth: signInWithOAuthMock,
      },
    } as never);
  });

  it('stores the provider before starting the Google OAuth redirect', async () => {
    signInWithOAuthMock.mockResolvedValue({ error: null });

    await signInWithGoogle();

    expect(window.sessionStorage.getItem('oauthProvider')).toBe('google');
    expect(signInWithOAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });

  it('resolves the stored provider and merge status after a successful callback', async () => {
    window.sessionStorage.setItem('oauthProvider', 'google');
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'access', refresh_token: 'refresh' } },
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ action: 'merged' }), { status: 200 })
    );

    const result = await handleOAuthCallback();

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      provider: 'google',
      merged: true,
      access_token: 'access',
      refresh_token: 'refresh',
    });
    expect(window.sessionStorage.getItem('oauthProvider')).toBeNull();
  });

  it('returns an error when no OAuth provider was stored for the callback', async () => {
    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toBe('OAuth session could not be established');
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('returns the backend error when the callback request fails', async () => {
    window.sessionStorage.setItem('oauthProvider', 'facebook');
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'access', refresh_token: 'refresh' } },
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
      })
    );

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toBe('Invalid token');
    expect(window.sessionStorage.getItem('oauthProvider')).toBeNull();
  });
});
