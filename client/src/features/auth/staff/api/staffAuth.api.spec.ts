import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgotPassword, login, mfaEnroll, mfaVerify } from './staffAuth.api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('staffAuth.api', () => {
  it('posts login credentials to the staff login endpoint', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await login({ username: 'james', password: 'secret' });

    expect(fetchSpy).toHaveBeenCalledWith('/staff/login', expect.any(Object));
  });

  it('posts MFA enrollment requests and returns a QR code URI', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ qrCodeUri: 'otpauth://totp/Test' }),
    } as Response);

    const result = await mfaEnroll();

    expect(result.data?.qrCodeUri).toBe('otpauth://totp/Test');
  });

  it('posts the TOTP code to the verification endpoint', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await mfaVerify({ code: '123456' });

    expect(global.fetch).toHaveBeenCalledWith(
      '/staff/mfa/verify',
      expect.any(Object)
    );
  });

  it('calls the forgot-password endpoint and reports success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const result = await forgotPassword({ username: 'james' });

    expect(result.data?.success).toBe(true);
  });
});
