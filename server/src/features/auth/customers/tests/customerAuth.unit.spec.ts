import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  customerSignupController,
  customerLoginController,
  customerMfaEnrollController,
  customerMfaVerifyController,
  customerMfaStatusController,
  customerMfaUnenrollController,
  customerOauthCallbackController,
} from '../customerAuth.controller.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';
import * as accountMergeService from '../services/accountMerge.service.ts';
import * as mfaLockoutService from '../../../../shared/services/mfaLockout/mfaLockout.service.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      getUser: vi.fn(),
      admin: {
        createUser: vi.fn(),
      },
    },
    from: vi.fn(),
  },
}));

const mockUserClient = {
  auth: {
    mfa: {
      enroll: vi.fn(),
      unenroll: vi.fn(),
      listFactors: vi.fn(),
      challenge: vi.fn(),
      verify: vi.fn(),
    },
    refreshSession: vi.fn(),
    signInWithPassword: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockUserClient),
}));

vi.mock('../services/accountMerge.service.ts', () => ({
  mergeOrCreate: vi.fn(),
}));

vi.mock('../../../../shared/services/mfaLockout/mfaLockout.service.ts', () => ({
  checkMfaLockout: vi.fn(),
  incrementMfaLockout: vi.fn(),
  resetMfaLockout: vi.fn(),
  formatMfaLockoutResponse: vi.fn((status) => ({
    error: 'MFA verification locked',
    retry_after_seconds: status.retryAfterSeconds,
    locked_until: status.lockedUntil,
  })),
}));

describe('customerAuth.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mfaLockoutService.checkMfaLockout).mockResolvedValue({
      locked: false,
      lockedUntil: null,
      retryAfterSeconds: null,
      failedAttempts: 0,
    });
    vi.mocked(mfaLockoutService.incrementMfaLockout).mockResolvedValue({
      locked: false,
      lockedUntil: null,
      retryAfterSeconds: null,
      failedAttempts: 1,
    });
  });

  const mockRequest = (body: any = {}, headers: any = {}) =>
    ({
      body,
      headers,
    }) as any;

  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe('customerSignupController', () => {
    it('returns 400 for invalid payload', async () => {
      const req = mockRequest({
        account_email: 'not-an-email',
        password: '123',
      });
      const res = mockResponse();

      await customerSignupController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid payload' })
      );
    });

    it('returns 201 on successful signup', async () => {
      const req = mockRequest({
        full_name: 'John Doe',
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      (supabase.auth.admin.createUser as any).mockResolvedValue({
        data: { user: { id: 'user-id' } },
        error: null,
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({ insert: insertMock });

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: {
          session: {
            access_token: 'acc-token',
            refresh_token: 'ref-token',
            expires_in: 3600,
          },
        },
        error: null,
      });

      await customerSignupController(req, res);

      expect(supabase.auth.admin.createUser).toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-id',
          account_email: 'john@example.com',
          primary_auth_provider: 'email',
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('customerLoginController', () => {
    it('returns 200 on successful login', async () => {
      const req = mockRequest({
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'valid-token' })
      );
    });

    it('does not require MFA during customer login', async () => {
      const req = mockRequest({
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'aal1-token' } },
        error: null,
      });

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockUserClient.auth.mfa.listFactors).not.toHaveBeenCalled();
      expect(mockUserClient.auth.mfa.challenge).not.toHaveBeenCalled();
    });
  });

  describe('customerMfaEnrollController', () => {
    it('enrolls a customer TOTP factor with the authenticated user client', async () => {
      const req = mockRequest({}, { authorization: 'Bearer customer-token' });
      const res = mockResponse();

      mockUserClient.auth.mfa.listFactors.mockResolvedValue({
        data: { all: [] },
        error: null,
      });
      mockUserClient.auth.mfa.enroll.mockResolvedValue({
        data: { id: 'factor-id', type: 'totp' },
        error: null,
      });

      await customerMfaEnrollController(req, res);

      expect(mockUserClient.auth.mfa.enroll).toHaveBeenCalledWith({
        factorType: 'totp',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ id: 'factor-id', type: 'totp' });
    });

    it('unenrolls a prior unverified factor before enrolling a new one', async () => {
      const req = mockRequest({}, { authorization: 'Bearer customer-token' });
      const res = mockResponse();

      mockUserClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [
            { id: 'stale-factor', factor_type: 'totp', status: 'unverified' },
          ],
        },
        error: null,
      });
      mockUserClient.auth.mfa.unenroll.mockResolvedValue({
        data: {},
        error: null,
      });
      mockUserClient.auth.mfa.enroll.mockResolvedValue({
        data: { id: 'fresh-factor', type: 'totp' },
        error: null,
      });

      await customerMfaEnrollController(req, res);

      expect(mockUserClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'stale-factor',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: 'fresh-factor',
        type: 'totp',
      });
    });
  });

  describe('customerMfaStatusController', () => {
    it('returns 401 when the request has no authenticated user', async () => {
      const req = mockRequest({}, { authorization: 'Bearer customer-token' });
      const res = mockResponse();

      await customerMfaStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('reports mfa_enrolled from the caller listFactors result', async () => {
      const req = {
        ...mockRequest({}, { authorization: 'Bearer customer-token' }),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      mockUserClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
        },
        error: null,
      });

      await customerMfaStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ mfa_enrolled: true });
    });
  });

  describe('customerMfaUnenrollController', () => {
    it('returns 401 when the request has no authenticated user', async () => {
      const req = mockRequest({}, { authorization: 'Bearer customer-token' });
      const res = mockResponse();

      await customerMfaUnenrollController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('removes every totp factor for the caller', async () => {
      const req = {
        ...mockRequest({}, { authorization: 'Bearer customer-token' }),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      mockUserClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
        },
        error: null,
      });
      mockUserClient.auth.mfa.unenroll.mockResolvedValue({
        data: {},
        error: null,
      });

      await customerMfaUnenrollController(req, res);

      expect(mockUserClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'factor-1',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        removed: ['factor-1'],
        failed: [],
      });
    });
  });

  describe('customerMfaVerifyController', () => {
    it('verifies a customer TOTP code and returns a refreshed aal2 session', async () => {
      const req = mockRequest(
        { code: '123456' },
        { authorization: 'Bearer customer-token' }
      );
      req.user = { sub: 'customer-id' };
      const res = mockResponse();

      mockUserClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'factor-id', factor_type: 'totp', status: 'unverified' }],
        },
        error: null,
      });
      mockUserClient.auth.mfa.challenge.mockResolvedValue({
        data: { id: 'challenge-id' },
        error: null,
      });
      mockUserClient.auth.mfa.verify.mockResolvedValue({ error: null });
      mockUserClient.auth.refreshSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'aal2-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      });

      await customerMfaVerifyController(req, res);

      expect(mfaLockoutService.checkMfaLockout).toHaveBeenCalledWith(
        'customer-id'
      );
      expect(mockUserClient.auth.mfa.challenge).toHaveBeenCalledWith({
        factorId: 'factor-id',
      });
      expect(mockUserClient.auth.mfa.verify).toHaveBeenCalledWith({
        factorId: 'factor-id',
        challengeId: 'challenge-id',
        code: '123456',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        access_token: 'aal2-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      });
      expect(mfaLockoutService.resetMfaLockout).toHaveBeenCalledWith(
        'customer-id'
      );
    });

    it('returns 400 for an invalid TOTP payload', async () => {
      const req = mockRequest({ code: '123' });
      const res = mockResponse();

      await customerMfaVerifyController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUserClient.auth.mfa.listFactors).not.toHaveBeenCalled();
    });

    it('returns 423 without verifying when the customer is locked out', async () => {
      const req = mockRequest(
        { code: '123456' },
        { authorization: 'Bearer customer-token' }
      );
      req.user = { sub: 'customer-id' };
      const res = mockResponse();

      vi.mocked(mfaLockoutService.checkMfaLockout).mockResolvedValue({
        locked: true,
        lockedUntil: '2026-07-04T00:15:00.000Z',
        retryAfterSeconds: 900,
        failedAttempts: 5,
      });

      await customerMfaVerifyController(req, res);

      expect(res.status).toHaveBeenCalledWith(423);
      expect(res.json).toHaveBeenCalledWith({
        error: 'MFA verification locked',
        retry_after_seconds: 900,
        locked_until: '2026-07-04T00:15:00.000Z',
      });
      expect(mockUserClient.auth.mfa.listFactors).not.toHaveBeenCalled();
    });

    it('increments lockout attempts when the customer TOTP code is invalid', async () => {
      const req = mockRequest(
        { code: '123456' },
        { authorization: 'Bearer customer-token' }
      );
      req.user = { sub: 'customer-id' };
      const res = mockResponse();

      mockUserClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'factor-id', factor_type: 'totp', status: 'verified' }],
        },
        error: null,
      });
      mockUserClient.auth.mfa.challenge.mockResolvedValue({
        data: { id: 'challenge-id' },
        error: null,
      });
      mockUserClient.auth.mfa.verify.mockResolvedValue({
        error: new Error('Invalid code'),
      });

      await customerMfaVerifyController(req, res);

      expect(mfaLockoutService.incrementMfaLockout).toHaveBeenCalledWith(
        'customer-id'
      );
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('customerOauthCallbackController', () => {
    it('returns 401 if token is missing', async () => {
      const req = mockRequest({}, {});
      const res = mockResponse();

      await customerOauthCallbackController(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('calls mergeOrCreate and returns 200 on success', async () => {
      const req = mockRequest({}, { authorization: 'Bearer valid-token' });
      const res = mockResponse();

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'user-id', email: 'john@example.com' } },
        error: null,
      });

      (accountMergeService.mergeOrCreate as any).mockResolvedValue({
        action: 'merged',
        profile: { id: 'user-id' },
      });

      await customerOauthCallbackController(req, res);

      expect(accountMergeService.mergeOrCreate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, action: 'merged' })
      );
    });
  });
});
