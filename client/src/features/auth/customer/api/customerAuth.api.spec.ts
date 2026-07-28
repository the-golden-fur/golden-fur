import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import { handleOAuthCallback, signInWithGoogle } from './customerAuth.api';

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
  setSessionPersistence: vi.fn(),
}));

describe('customerAuth.api', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const setSessionMock = vi.fn();
  const signInWithOAuthMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    setSessionMock.mockReset();
    signInWithOAuthMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.clear();
    window.location.hash = '';

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        setSession: setSessionMock,
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
    window.location.hash = '#access_token=access&refresh_token=refresh';
    setSessionMock.mockResolvedValue({
      data: { session: { access_token: 'access', refresh_token: 'refresh' } },
      error: null,
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ action: 'merged' }), { status: 200 })
    );

    const result = await handleOAuthCallback();

    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      provider: 'google',
      merged: true,
      access_token: 'access',
      refresh_token: 'refresh',
    });
    expect(window.sessionStorage.getItem('oauthProvider')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('still establishes the session from the fragment tokens when the sessionStorage marker was lost in the redirect', async () => {
    // Regression test: observed in manual testing that this marker does not
    // reliably survive the redirect through Facebook and back (browser
    // privacy protections can clear it), even though Supabase's own
    // redirect Location header carried valid tokens the whole time. The
    // fragment's tokens, not this marker, must be what gates success.
    window.location.hash = '#access_token=access&refresh_token=refresh';
    setSessionMock.mockResolvedValue({
      data: { session: { access_token: 'access', refresh_token: 'refresh' } },
      error: null,
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ action: 'created' }), { status: 200 })
    );

    const result = await handleOAuthCallback();

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      provider: null,
      merged: false,
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  it('surfaces the provider-level error from the URL fragment before establishing a session', async () => {
    window.sessionStorage.setItem('oauthProvider', 'facebook');
    window.location.hash =
      '#error=server_error&error_description=Error+getting+user+email+from+external+provider';

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toBe(
      'Error getting user email from external provider'
    );
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('oauthProvider')).toBeNull();
  });

  it('returns an error when the fragment carries no tokens and no error', async () => {
    window.sessionStorage.setItem('oauthProvider', 'facebook');

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toBe('OAuth session could not be established');
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('oauthProvider')).toBeNull();
  });

  it('surfaces the real error when setSession rejects the tokens', async () => {
    window.sessionStorage.setItem('oauthProvider', 'facebook');
    window.location.hash = '#access_token=access&refresh_token=refresh';
    setSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid refresh token' },
    });

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toBe('Invalid refresh token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the backend error when the callback request fails', async () => {
    window.sessionStorage.setItem('oauthProvider', 'facebook');
    window.location.hash = '#access_token=access&refresh_token=refresh';
    setSessionMock.mockResolvedValue({
      data: { session: { access_token: 'access', refresh_token: 'refresh' } },
      error: null,
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
