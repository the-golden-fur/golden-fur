import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../api/auth.api';
import { handleOAuthCallback, signInWithGoogle } from './customerAuth.api';

vi.mock('../../api/auth.api', () => ({
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

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: getSessionMock,
        signInWithOAuth: signInWithOAuthMock,
      },
    } as never);
  });

  it('starts the Google OAuth redirect', async () => {
    signInWithOAuthMock.mockResolvedValue({ error: null });

    const result = await signInWithGoogle();

    expect(signInWithOAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
    expect(result.error).toBeNull();
  });

  it('resolves the provider and merge status from the session after a successful callback', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          user: { app_metadata: { provider: 'google' } },
        },
      },
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
  });

  it('returns an error when Supabase does not return a session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/did not return a valid session/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an error when the session has an unrecognized provider', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          user: { app_metadata: { provider: 'email' } },
        },
      },
    });

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Unrecognized sign-in provider/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the backend error when the callback request fails', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          user: { app_metadata: { provider: 'facebook' } },
        },
      },
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
      })
    );

    const result = await handleOAuthCallback();

    expect(result.data).toBeNull();
    expect(result.error).toBe('Invalid token');
  });
});
