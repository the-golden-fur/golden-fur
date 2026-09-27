import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollMfa, getMfaStatus, unenrollMfa, verifyMfa } from './mfa.api';

describe('mfa.api', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('getMfaStatus returns the parsed status on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ mfa_enrolled: true, role: 'Admin' }), {
        status: 200,
      })
    );

    const result = await getMfaStatus('staff', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/staff/mfa/status',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    );
    expect(result.data).toEqual({ mfa_enrolled: true, role: 'Admin' });
  });

  it('returns a backend error message without throwing', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid code' }), { status: 401 })
    );

    const result = await verifyMfa('staff', '000000', 'token');

    expect(result.data).toBeNull();
    expect(result.error).toBe('Invalid code');
  });

  it.each([
    ['getMfaStatus', () => getMfaStatus('staff', 'token')],
    ['enrollMfa', () => enrollMfa('staff', 'token')],
    ['verifyMfa', () => verifyMfa('staff', '000000', 'token')],
    ['unenrollMfa', () => unenrollMfa('staff', 'token')],
  ])(
    'regression: %s resolves with a friendly error instead of throwing when the network request itself fails (the reported "random freeze" on login/MFA - a caller awaiting this must always get a settled result, never an uncaught rejection)',
    async (_name, call) => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await call();

      expect(result.data).toBeNull();
      expect(result.error).toMatch(/could not reach the server/i);
    }
  );
});
