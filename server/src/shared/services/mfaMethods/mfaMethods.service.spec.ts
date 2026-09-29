import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getMfaMethodStatus,
  enrollMfaMethod,
  sendMfaEmailMethodCode,
  challengeAndVerifyMfaMethod,
  unenrollMfaMethod,
} from './mfaMethods.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { enrollTotpFactor } from '../../auth/api/supabaseAuth.api.ts';
import { sendMfaEmailCodeEmail } from '../../email/mfaEmailCodeEmail.ts';
import { generate } from 'otplib';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../auth/api/supabaseAuth.api.ts', () => ({
  enrollTotpFactor: vi.fn(),
}));

vi.mock('../../email/mfaEmailCodeEmail.ts', () => ({
  sendMfaEmailCodeEmail: vi.fn(),
}));

vi.mock('otplib', () => ({
  generate: vi.fn(),
}));

vi.mock('../../crypto/mfaEmailSecret.ts', () => ({
  encryptMfaEmailSecret: vi.fn((secret: string) => ({
    ciphertext: `enc(${secret})`,
    iv: 'iv-value',
  })),
  decryptMfaEmailSecret: vi.fn(({ ciphertext }: { ciphertext: string }) =>
    ciphertext.replace(/^enc\(/, '').replace(/\)$/, '')
  ),
}));

interface FactorMethodRow {
  factor_id: string;
  method: 'authenticator' | 'email';
  secret_ciphertext: string | null;
  secret_iv: string | null;
  last_code_sent_at?: string | null;
}

function mockFactorMethodTable(
  rows: FactorMethodRow[],
  options: { upsert?: ReturnType<typeof vi.fn> } = {}
) {
  const deleteMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
  const upsertMock =
    options.upsert ?? vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table !== 'mfa_factor_methods') return {} as any;

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: rows.map((row) => ({
            last_code_sent_at: null,
            ...row,
          })),
          error: null,
        }),
      }),
      upsert: upsertMock,
      delete: deleteMock,
      update: updateMock,
    } as any;
  });

  return { deleteMock, upsertMock, updateMock };
}

describe('mfaMethods.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMfaMethodStatus', () => {
    it('reports both methods enrolled when their mapped factors are verified', async () => {
      mockFactorMethodTable([
        {
          factor_id: 'auth-factor',
          method: 'authenticator',
          secret_ciphertext: null,
          secret_iv: null,
        },
        {
          factor_id: 'email-factor',
          method: 'email',
          secret_ciphertext: 'enc(SECRET)',
          secret_iv: 'iv-value',
        },
      ]);
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  {
                    id: 'auth-factor',
                    factor_type: 'totp',
                    status: 'verified',
                  },
                  {
                    id: 'email-factor',
                    factor_type: 'totp',
                    status: 'verified',
                  },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const status = await getMfaMethodStatus(userClient, 'user-1');

      expect(status).toEqual({ authenticator: true, email: true });
    });

    it('reports false for a method whose mapped factor is not verified', async () => {
      mockFactorMethodTable([
        {
          factor_id: 'auth-factor',
          method: 'authenticator',
          secret_ciphertext: null,
          secret_iv: null,
        },
      ]);
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  {
                    id: 'auth-factor',
                    factor_type: 'totp',
                    status: 'unverified',
                  },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      expect(await getMfaMethodStatus(userClient, 'user-1')).toEqual({
        authenticator: false,
        email: false,
      });
    });

    it('finds and backfills a legacy authenticator factor with no mapping row', async () => {
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFactorMethodTable([], { upsert: upsertSpy });
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  {
                    id: 'legacy-factor',
                    factor_type: 'totp',
                    status: 'verified',
                  },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const status = await getMfaMethodStatus(userClient, 'user-1');

      expect(status.authenticator).toBe(true);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          factor_id: 'legacy-factor',
          user_id: 'user-1',
          method: 'authenticator',
        }),
        { onConflict: 'user_id,method' }
      );
    });

    it('never applies the legacy fallback to email', async () => {
      mockFactorMethodTable([]);
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi
              .fn()
              .mockResolvedValue({ data: { all: [] }, error: null }),
          },
        },
      } as any;

      expect(await getMfaMethodStatus(userClient, 'user-1')).toEqual({
        authenticator: false,
        email: false,
      });
    });
  });

  describe('enrollMfaMethod', () => {
    it('enrolls the authenticator method, records no secret, and returns the QR/secret', async () => {
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFactorMethodTable([], { upsert: upsertSpy });
      vi.mocked(enrollTotpFactor).mockResolvedValue({
        data: {
          id: 'new-factor',
          totp: { qr_code: 'data:...', secret: 'SECRET' },
        },
        error: null,
      } as any);

      const userClient = {} as any;
      const result = await enrollMfaMethod(
        userClient,
        'user-1',
        'authenticator',
        'staff@example.com'
      );

      expect(enrollTotpFactor).toHaveBeenCalledWith(
        userClient,
        'authenticator-app'
      );
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          factor_id: 'new-factor',
          method: 'authenticator',
          secret_ciphertext: null,
          secret_iv: null,
        }),
        { onConflict: 'user_id,method' }
      );
      expect(sendMfaEmailCodeEmail).not.toHaveBeenCalled();
      expect(result).toEqual({
        factorId: 'new-factor',
        totp: { qr_code: 'data:...', secret: 'SECRET' },
      });
    });

    it('enrolls the email method, encrypts the secret, and emails the first code', async () => {
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      const { updateMock } = mockFactorMethodTable([], { upsert: upsertSpy });
      vi.mocked(enrollTotpFactor).mockResolvedValue({
        data: { id: 'email-factor', totp: { secret: 'SECRET' } },
        error: null,
      } as any);
      vi.mocked(generate).mockResolvedValue('654321');

      const result = await enrollMfaMethod(
        {} as any,
        'user-1',
        'email',
        'staff@example.com'
      );

      expect(enrollTotpFactor).toHaveBeenCalledWith(expect.anything(), 'email');
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          factor_id: 'email-factor',
          method: 'email',
          secret_ciphertext: 'enc(SECRET)',
          secret_iv: 'iv-value',
        }),
        { onConflict: 'user_id,method' }
      );
      expect(generate).toHaveBeenCalledWith({ secret: 'SECRET' });
      expect(sendMfaEmailCodeEmail).toHaveBeenCalledWith({
        to: 'staff@example.com',
        code: '654321',
      });
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ last_code_sent_at: expect.any(String) })
      );
      expect(result.factorId).toBe('email-factor');
      expect(result.totp).toBeUndefined();
    });

    it('throws when the enroll call itself fails', async () => {
      vi.mocked(enrollTotpFactor).mockResolvedValue({
        data: null,
        error: new Error('enroll failed'),
      } as any);

      await expect(
        enrollMfaMethod({} as any, 'user-1', 'authenticator', 'a@b.com')
      ).rejects.toThrow('enroll failed');
    });

    it('throws when enrolling email but no secret comes back', async () => {
      vi.mocked(enrollTotpFactor).mockResolvedValue({
        data: { id: 'email-factor', totp: {} },
        error: null,
      } as any);

      await expect(
        enrollMfaMethod({} as any, 'user-1', 'email', 'a@b.com')
      ).rejects.toThrow('Enrollment did not return a secret');
    });
  });

  describe('sendMfaEmailMethodCode', () => {
    it('returns not_configured when the email method is not set up', async () => {
      mockFactorMethodTable([]);
      expect(await sendMfaEmailMethodCode('user-1', 'a@b.com')).toEqual({
        status: 'not_configured',
      });
      expect(sendMfaEmailCodeEmail).not.toHaveBeenCalled();
    });

    it('decrypts the secret, computes, and emails the current code', async () => {
      const { updateMock } = mockFactorMethodTable([
        {
          factor_id: 'email-factor',
          method: 'email',
          secret_ciphertext: 'enc(SECRET)',
          secret_iv: 'iv-value',
        },
      ]);
      vi.mocked(generate).mockResolvedValue('111222');

      const result = await sendMfaEmailMethodCode('user-1', 'a@b.com');

      expect(generate).toHaveBeenCalledWith({ secret: 'SECRET' });
      expect(sendMfaEmailCodeEmail).toHaveBeenCalledWith({
        to: 'a@b.com',
        code: '111222',
      });
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ last_code_sent_at: expect.any(String) })
      );
      expect(result).toEqual({ status: 'sent' });
    });

    it('rate-limits a second request within the cooldown window', async () => {
      mockFactorMethodTable([
        {
          factor_id: 'email-factor',
          method: 'email',
          secret_ciphertext: 'enc(SECRET)',
          secret_iv: 'iv-value',
          last_code_sent_at: new Date(Date.now() - 5000).toISOString(),
        },
      ]);

      const result = await sendMfaEmailMethodCode('user-1', 'a@b.com');

      expect(result.status).toBe('rate_limited');
      expect(sendMfaEmailCodeEmail).not.toHaveBeenCalled();
      if (result.status === 'rate_limited') {
        expect(result.retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    it('allows a request once the cooldown has elapsed', async () => {
      mockFactorMethodTable([
        {
          factor_id: 'email-factor',
          method: 'email',
          secret_ciphertext: 'enc(SECRET)',
          secret_iv: 'iv-value',
          last_code_sent_at: new Date(Date.now() - 30000).toISOString(),
        },
      ]);
      vi.mocked(generate).mockResolvedValue('999999');

      const result = await sendMfaEmailMethodCode('user-1', 'a@b.com');

      expect(result).toEqual({ status: 'sent' });
      expect(sendMfaEmailCodeEmail).toHaveBeenCalled();
    });
  });

  describe('challengeAndVerifyMfaMethod', () => {
    it('returns null when the method has no resolvable factor', async () => {
      mockFactorMethodTable([]);
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi
              .fn()
              .mockResolvedValue({ data: { all: [] }, error: null }),
          },
        },
      } as any;

      expect(
        await challengeAndVerifyMfaMethod(
          userClient,
          'user-1',
          'email',
          '123456'
        )
      ).toBeNull();
    });

    it('returns the challenge error without calling verify', async () => {
      mockFactorMethodTable([
        {
          factor_id: 'auth-factor',
          method: 'authenticator',
          secret_ciphertext: null,
          secret_iv: null,
        },
      ]);
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn(),
            challenge: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('challenge failed'),
            }),
            verify: vi.fn(),
          },
        },
      } as any;

      const result = await challengeAndVerifyMfaMethod(
        userClient,
        'user-1',
        'authenticator',
        '123456'
      );

      expect(result).toEqual({ verifyError: { message: 'challenge failed' } });
      expect(userClient.auth.mfa.verify).not.toHaveBeenCalled();
    });

    it('returns null verifyError on a correct code', async () => {
      mockFactorMethodTable([
        {
          factor_id: 'auth-factor',
          method: 'authenticator',
          secret_ciphertext: null,
          secret_iv: null,
        },
      ]);
      const userClient = {
        auth: {
          mfa: {
            challenge: vi
              .fn()
              .mockResolvedValue({ data: { id: 'challenge-1' }, error: null }),
            verify: vi.fn().mockResolvedValue({ error: null }),
          },
        },
      } as any;

      const result = await challengeAndVerifyMfaMethod(
        userClient,
        'user-1',
        'authenticator',
        '123456'
      );

      expect(userClient.auth.mfa.verify).toHaveBeenCalledWith({
        factorId: 'auth-factor',
        challengeId: 'challenge-1',
        code: '123456',
      });
      expect(result).toEqual({ verifyError: null });
    });
  });

  describe('unenrollMfaMethod', () => {
    it('is a no-op when the method has no resolvable factor', async () => {
      mockFactorMethodTable([]);
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi
              .fn()
              .mockResolvedValue({ data: { all: [] }, error: null }),
            unenroll: vi.fn(),
          },
        },
      } as any;

      const result = await unenrollMfaMethod(userClient, 'user-1', 'email');

      expect(result).toEqual({ error: null });
      expect(userClient.auth.mfa.unenroll).not.toHaveBeenCalled();
    });

    it('unenrolls the factor and deletes the mapping row on success', async () => {
      const { deleteMock } = mockFactorMethodTable([
        {
          factor_id: 'email-factor',
          method: 'email',
          secret_ciphertext: 'enc(S)',
          secret_iv: 'iv',
        },
      ]);
      const userClient = {
        auth: { mfa: { unenroll: vi.fn().mockResolvedValue({ error: null }) } },
      } as any;

      const result = await unenrollMfaMethod(userClient, 'user-1', 'email');

      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'email-factor',
      });
      expect(deleteMock).toHaveBeenCalled();
      expect(result).toEqual({ error: null });
    });

    it('returns the error and does not delete the mapping when Supabase refuses', async () => {
      const { deleteMock } = mockFactorMethodTable([
        {
          factor_id: 'auth-factor',
          method: 'authenticator',
          secret_ciphertext: null,
          secret_iv: null,
        },
      ]);
      const userClient = {
        auth: {
          mfa: {
            unenroll: vi
              .fn()
              .mockResolvedValue({ error: new Error('AAL2 required') }),
          },
        },
      } as any;

      const result = await unenrollMfaMethod(
        userClient,
        'user-1',
        'authenticator'
      );

      expect(result).toEqual({ error: { message: 'AAL2 required' } });
      expect(deleteMock).not.toHaveBeenCalled();
    });
  });
});
