import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgotPassword, login, mfaEnroll, mfaVerify } from './staffAuth.api';

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
});
