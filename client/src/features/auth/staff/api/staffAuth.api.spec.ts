import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import {
  establishRecoverySession,
  forgotPassword,
  login,
  mfaEnroll,
  mfaVerify,
  updateStaffPassword,
} from './staffAuth.api';

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
  setSessionPersistence: vi.fn(),
}));

describe('staffAuth.api', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('posts staff login credentials', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
        }),
        { status: 200 }
      )
    );

    const result = await login({ identifier: 'admin', password: 'secret' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/staff/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ identifier: 'admin', password: 'secret' }),
      })
    );
    expect(result.data?.access_token).toBe('access');
    expect(result.error).toBeNull();
  });

  it('sends bearer tokens for MFA endpoints', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ totp: { qr_code: 'data:image/svg+xml' } }),
        {
          status: 200,
        }
      )
    );

    await mfaEnroll('token');

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/staff/mfa/enroll',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  it('returns backend errors without throwing', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid code' }), { status: 401 })
    );

    const result = await mfaVerify({ code: '000000' }, 'token');

    expect(result.data).toBeNull();
    expect(result.error).toBe('Invalid code');
  });

  it('posts forgot-password requests', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Password reset email sent' }), {
        status: 200,
      })
    );

    const result = await forgotPassword({ email: 'staff@example.com' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/staff/forgot-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'staff@example.com' }),
      })
    );
    expect(result.data?.message).toBe('Password reset email sent');
  });

  describe('establishRecoverySession', () => {
    afterEach(() => {
      window.location.hash = '';
    });

    it('parses the recovery hash and establishes a session, clearing the hash', async () => {
      window.location.hash =
        '#access_token=at-1&refresh_token=rt-1&type=recovery';
      const setSession = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(getSupabaseClient).mockReturnValue({
        auth: { setSession },
      } as never);

      const result = await establishRecoverySession();

      expect(setSession).toHaveBeenCalledWith({
        access_token: 'at-1',
        refresh_token: 'rt-1',
      });
      expect(result.error).toBeNull();
      expect(window.location.hash).toBe('');
    });

    it('returns an error when the hash has no tokens (expired/invalid link)', async () => {
      window.location.hash = '';
      vi.mocked(getSupabaseClient).mockReturnValue({
        auth: { setSession: vi.fn() },
      } as never);

      const result = await establishRecoverySession();

      expect(result.error).toMatch(/invalid or has expired/i);
    });

    it('surfaces a provider error from the hash', async () => {
      window.location.hash = '#error_description=Link+expired';
      vi.mocked(getSupabaseClient).mockReturnValue({
        auth: { setSession: vi.fn() },
      } as never);

      const result = await establishRecoverySession();

      expect(result.error).toBe('Link expired');
    });
  });

  describe('updateStaffPassword', () => {
    it('calls Supabase updateUser with the new password', async () => {
      const updateUser = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(getSupabaseClient).mockReturnValue({
        auth: { updateUser },
      } as never);

      const result = await updateStaffPassword('newpassword123');

      expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword123' });
      expect(result.error).toBeNull();
    });

    it('surfaces an error from Supabase', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue({
        auth: {
          updateUser: vi
            .fn()
            .mockResolvedValue({ error: { message: 'Password too weak' } }),
        },
      } as never);

      const result = await updateStaffPassword('weak');

      expect(result.error).toBe('Password too weak');
    });
  });
});
