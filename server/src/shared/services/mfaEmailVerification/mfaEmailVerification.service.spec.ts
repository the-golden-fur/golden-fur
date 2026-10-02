import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getMfaEmailVerification,
  startMfaEmailVerification,
  confirmMfaEmailVerification,
  unbindMfaEmail,
} from './mfaEmailVerification.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendMfaEmailVerificationEmail } from '../../email/mfaEmailVerificationEmail.ts';
import { unenrollMfaMethod } from '../mfaMethods/mfaMethods.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../email/mfaEmailVerificationEmail.ts', () => ({
  sendMfaEmailVerificationEmail: vi.fn(),
}));

vi.mock('../mfaMethods/mfaMethods.service.ts', () => ({
  unenrollMfaMethod: vi.fn(),
}));

function mockSelectRow(row: unknown) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'mfa_email_verifications') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      } as any;
    }
    return {} as any;
  });
}

describe('mfaEmailVerification.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMfaEmailVerification', () => {
    it('returns null when no row exists', async () => {
      mockSelectRow(null);
      expect(await getMfaEmailVerification('user-1')).toBeNull();
    });

    it('reports verified: false while a code is pending', async () => {
      mockSelectRow({ email: 'a@example.com', verified_at: null });
      expect(await getMfaEmailVerification('user-1')).toEqual({
        email: 'a@example.com',
        verified: false,
      });
    });

    it('reports verified: true once verified_at is set', async () => {
      mockSelectRow({
        email: 'a@example.com',
        verified_at: '2026-01-01T00:00:00Z',
      });
      expect(await getMfaEmailVerification('user-1')).toEqual({
        email: 'a@example.com',
        verified: true,
      });
    });
  });

  describe('startMfaEmailVerification', () => {
    it('hashes the code (never stores it in plain text) and emails the raw code', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'mfa_email_verifications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
            upsert,
          } as any;
        }
        return {} as any;
      });

      const result = await startMfaEmailVerification('user-1', 'a@example.com');

      expect(result).toEqual({ status: 'sent' });
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          email: 'a@example.com',
          verified_at: null,
        }),
        { onConflict: 'user_id' }
      );
      const inserted = upsert.mock.calls[0][0];
      expect(inserted.code_hash).toEqual(expect.any(String));

      expect(sendMfaEmailVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@example.com' })
      );
      const sentCode = vi.mocked(sendMfaEmailVerificationEmail).mock.calls[0][0]
        .code;
      expect(inserted.code_hash).not.toBe(sentCode);
    });

    it('rate-limits a resend within the cooldown window', async () => {
      mockSelectRow({
        email: 'a@example.com',
        verified_at: null,
        code_sent_at: new Date().toISOString(),
      });

      const result = await startMfaEmailVerification('user-1', 'a@example.com');

      expect(result.status).toBe('rate_limited');
      expect(sendMfaEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('allows a resend once the cooldown has elapsed', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'mfa_email_verifications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: 'a@example.com',
                    verified_at: null,
                    code_sent_at: new Date(Date.now() - 61_000).toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
            upsert,
          } as any;
        }
        return {} as any;
      });

      const result = await startMfaEmailVerification('user-1', 'a@example.com');

      expect(result).toEqual({ status: 'sent' });
    });
  });

  describe('confirmMfaEmailVerification', () => {
    it('returns no_pending_code when nothing was ever sent', async () => {
      mockSelectRow({
        email: 'a@example.com',
        verified_at: null,
        code_hash: null,
      });
      expect(await confirmMfaEmailVerification('user-1', '123456')).toEqual({
        status: 'no_pending_code',
      });
    });

    it('returns expired for a code past its expiry', async () => {
      mockSelectRow({
        email: 'a@example.com',
        code_hash: 'irrelevant',
        code_expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      expect(await confirmMfaEmailVerification('user-1', '123456')).toEqual({
        status: 'expired',
      });
    });

    it('returns invalid_code for a wrong code', async () => {
      mockSelectRow({
        email: 'a@example.com',
        code_hash: 'not-a-match',
        code_expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(await confirmMfaEmailVerification('user-1', '123456')).toEqual({
        status: 'invalid_code',
      });
    });

    it('verifies and clears the code on a correct match', async () => {
      const { createHash } = await import('node:crypto');
      const codeHash = createHash('sha256').update('123456').digest('hex');
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'mfa_email_verifications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: 'a@example.com',
                    code_hash: codeHash,
                    code_expires_at: new Date(
                      Date.now() + 60_000
                    ).toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
            update,
          } as any;
        }
        return {} as any;
      });

      const result = await confirmMfaEmailVerification('user-1', '123456');

      expect(result).toEqual({ status: 'verified' });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          verified_at: expect.any(String),
          code_hash: null,
        })
      );
    });
  });

  describe('unbindMfaEmail', () => {
    it('deletes the binding row and unenrolls the email MFA factor', async () => {
      const deleteEq = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({ eq: deleteEq }),
      } as any);
      vi.mocked(unenrollMfaMethod).mockResolvedValue({ error: null });

      const userClient = {} as any;
      await unbindMfaEmail(userClient, 'user-1');

      expect(deleteEq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(unenrollMfaMethod).toHaveBeenCalledWith(
        userClient,
        'user-1',
        'email'
      );
    });

    it('throws on a delete error without calling unenrollMfaMethod', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: new Error('boom') }),
        }),
      } as any);

      await expect(unbindMfaEmail({} as any, 'user-1')).rejects.toThrow('boom');
      expect(unenrollMfaMethod).not.toHaveBeenCalled();
    });
  });
});
