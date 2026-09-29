import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  customerSignupController,
  customerLoginController,
  customerMfaEnrollController,
  customerMfaEmailRequestCodeController,
  customerMfaVerifyController,
  customerMfaStatusController,
  customerMfaUnenrollController,
  customerOauthCallbackController,
} from '../customerAuth.controller.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';
import * as accountMergeService from '../services/accountMerge.service.ts';
import * as mfaLockoutService from '../../../../shared/services/mfaLockout/mfaLockout.service.ts';
import * as mfaMethodsService from '../../../../shared/services/mfaMethods/mfaMethods.service.ts';
import * as mfaPreferenceService from '../../../../shared/services/mfaPreference/mfaPreference.service.ts';
import * as trustedDeviceService from '../../../../shared/services/trustedDevice/trustedDevice.service.ts';
import * as supabaseAuthApi from '../../../../shared/auth/api/supabaseAuth.api.ts';

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
  MissingProviderEmailError: class MissingProviderEmailError extends Error {},
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

vi.mock('../../../../shared/services/mfaMethods/mfaMethods.service.ts', () => ({
  getMfaMethodStatus: vi.fn(),
  enrollMfaMethod: vi.fn(),
  unenrollMfaMethod: vi.fn(),
  challengeAndVerifyMfaMethod: vi.fn(),
  sendMfaEmailMethodCode: vi.fn(),
}));

vi.mock(
  '../../../../shared/services/mfaPreference/mfaPreference.service.ts',
  () => ({
    getMfaPreference: vi.fn(),
    setMfaPreference: vi.fn(),
  })
);

vi.mock(
  '../../../../shared/services/trustedDevice/trustedDevice.service.ts',
  () => ({
    issueTrustedDeviceToken: vi.fn(),
    isTrustedDevice: vi.fn(),
    revokeAllTrustedDevices: vi.fn(),
  })
);

vi.mock(
  '../../../../shared/auth/api/supabaseAuth.api.ts',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../shared/auth/api/supabaseAuth.api.ts')
      >();
    return { ...actual, getAuthUserEmail: vi.fn() };
  }
);

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
    function mockCustomerProfileFound(overrides: Record<string, unknown> = {}) {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'user-id',
          account_email: 'john@example.com',
          is_active: true,
          anonymized_at: null,
          ...overrides,
        },
        error: null,
      });
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      });
    }

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
      mockCustomerProfileFound();

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
      mockCustomerProfileFound();

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockUserClient.auth.mfa.listFactors).not.toHaveBeenCalled();
      expect(mockUserClient.auth.mfa.challenge).not.toHaveBeenCalled();
    });

    it('rejects login when the authenticated account has no customer_profiles row (cross-role login)', async () => {
      const req = mockRequest({
        account_email: 'staff@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('still succeeds for a deactivated account, flagged via account_status', async () => {
      const req = mockRequest({
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });
      mockCustomerProfileFound({ is_active: false });

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'valid-token',
          account_status: 'deactivated',
        })
      );
    });

    it('omits account_status entirely for an active account', async () => {
      const req = mockRequest({
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });
      mockCustomerProfileFound({ is_active: true });

      await customerLoginController(req, res);

      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg).not.toHaveProperty('account_status');
    });

    it('rejects an anonymized (permanently deleted) account like it does not exist', async () => {
      const req = mockRequest({
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      mockUserClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });
      // The real lookup is by account_email, which no longer matches once
      // anonymizeCustomer scrubs it - simulated here as "not found".
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });
  });

  describe('customerMfaEnrollController', () => {
    it('enrolls the authenticator method by default', async () => {
      const req = {
        ...mockRequest({}, { authorization: 'Bearer customer-token' }),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
        'customer@example.com'
      );
      vi.mocked(mfaMethodsService.enrollMfaMethod).mockResolvedValue({
        factorId: 'factor-id',
        totp: { qr_code: 'data:...', secret: 'SECRET' },
      });

      await customerMfaEnrollController(req, res);

      expect(mfaMethodsService.enrollMfaMethod).toHaveBeenCalledWith(
        mockUserClient,
        'customer-1',
        'authenticator',
        'customer@example.com'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: 'factor-id',
        totp: { qr_code: 'data:...', secret: 'SECRET' },
      });
    });

    it('enrolls the email method and sends the first code instead of returning a secret', async () => {
      const req = {
        ...mockRequest(
          { method: 'email' },
          { authorization: 'Bearer customer-token' }
        ),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
        'customer@example.com'
      );
      vi.mocked(mfaMethodsService.enrollMfaMethod).mockResolvedValue({
        factorId: 'email-factor',
      });

      await customerMfaEnrollController(req, res);

      expect(mfaMethodsService.enrollMfaMethod).toHaveBeenCalledWith(
        mockUserClient,
        'customer-1',
        'email',
        'customer@example.com'
      );
      expect(res.json).toHaveBeenCalledWith({ id: 'email-factor', sent: true });
    });
  });

  describe('customerMfaEmailRequestCodeController', () => {
    it('sends a code and returns 200', async () => {
      const req = {
        ...mockRequest({}, { authorization: 'Bearer customer-token' }),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
        'customer@example.com'
      );
      vi.mocked(mfaMethodsService.sendMfaEmailMethodCode).mockResolvedValue({
        status: 'sent',
      });

      await customerMfaEmailRequestCodeController(req, res);

      expect(mfaMethodsService.sendMfaEmailMethodCode).toHaveBeenCalledWith(
        'customer-1',
        'customer@example.com'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ sent: true });
    });

    it('returns 429 with a retry hint when rate-limited', async () => {
      const req = {
        ...mockRequest({}, { authorization: 'Bearer customer-token' }),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
        'customer@example.com'
      );
      vi.mocked(mfaMethodsService.sendMfaEmailMethodCode).mockResolvedValue({
        status: 'rate_limited',
        retryAfterSeconds: 15,
      });

      await customerMfaEmailRequestCodeController(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ retry_after_seconds: 15 })
      );
    });
  });

  describe('customerMfaStatusController', () => {
    it('returns 401 when the request has no authenticated user', async () => {
      const req = mockRequest({}, { authorization: 'Bearer customer-token' });
      const res = mockResponse();

      await customerMfaStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('reports methods, preferred_method, and a back-compat mfa_enrolled', async () => {
      const req = {
        ...mockRequest({}, { authorization: 'Bearer customer-token' }),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      vi.mocked(mfaMethodsService.getMfaMethodStatus).mockResolvedValue({
        authenticator: true,
        email: false,
      });
      vi.mocked(mfaPreferenceService.getMfaPreference).mockResolvedValue(
        'authenticator'
      );

      await customerMfaStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        mfa_enrolled: true,
        methods: { authenticator: true, email: false },
        preferred_method: 'authenticator',
      });
    });
  });

  describe('customerMfaUnenrollController', () => {
    it('returns 401 when the request has no authenticated user', async () => {
      const req = mockRequest({}, { authorization: 'Bearer customer-token' });
      const res = mockResponse();

      await customerMfaUnenrollController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('removes the given method for the caller, with no mandatory-role guard (customers have none)', async () => {
      const req = {
        ...mockRequest(
          { method: 'authenticator' },
          { authorization: 'Bearer customer-token' }
        ),
        user: { sub: 'customer-1' },
      };
      const res = mockResponse();

      vi.mocked(mfaMethodsService.unenrollMfaMethod).mockResolvedValue({
        error: null,
      });

      await customerMfaUnenrollController(req, res);

      expect(mfaMethodsService.unenrollMfaMethod).toHaveBeenCalledWith(
        mockUserClient,
        'customer-1',
        'authenticator'
      );
      expect(trustedDeviceService.revokeAllTrustedDevices).toHaveBeenCalledWith(
        'customer-1'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ removed: true });
    });
  });

  describe('customerMfaVerifyController', () => {
    it('verifies a customer code and returns a refreshed session', async () => {
      const req = mockRequest(
        { code: '123456' },
        { authorization: 'Bearer customer-token' }
      );
      req.user = { sub: 'customer-id' };
      const res = mockResponse();

      vi.mocked(
        mfaMethodsService.challengeAndVerifyMfaMethod
      ).mockResolvedValue({ verifyError: null });
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
      expect(
        mfaMethodsService.challengeAndVerifyMfaMethod
      ).toHaveBeenCalledWith(
        mockUserClient,
        'customer-id',
        'authenticator',
        '123456'
      );
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
      expect(
        mfaMethodsService.challengeAndVerifyMfaMethod
      ).not.toHaveBeenCalled();
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
      expect(
        mfaMethodsService.challengeAndVerifyMfaMethod
      ).not.toHaveBeenCalled();
    });

    it('increments lockout attempts when the customer code is invalid', async () => {
      const req = mockRequest(
        { code: '123456' },
        { authorization: 'Bearer customer-token' }
      );
      req.user = { sub: 'customer-id' };
      const res = mockResponse();

      vi.mocked(
        mfaMethodsService.challengeAndVerifyMfaMethod
      ).mockResolvedValue({ verifyError: { message: 'Invalid code' } });

      await customerMfaVerifyController(req, res);

      expect(mfaLockoutService.incrementMfaLockout).toHaveBeenCalledWith(
        'customer-id'
      );
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('issues a trusted-device token when remember_device is set - always eligible for customers', async () => {
      const req = mockRequest(
        { code: '123456', remember_device: true },
        { authorization: 'Bearer customer-token' }
      );
      req.user = { sub: 'customer-id' };
      const res = mockResponse();

      vi.mocked(
        mfaMethodsService.challengeAndVerifyMfaMethod
      ).mockResolvedValue({ verifyError: null });
      vi.mocked(trustedDeviceService.issueTrustedDeviceToken).mockResolvedValue(
        'raw-device-token'
      );
      mockUserClient.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await customerMfaVerifyController(req, res);

      expect(trustedDeviceService.issueTrustedDeviceToken).toHaveBeenCalledWith(
        'customer-id'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        device_token: 'raw-device-token',
      });
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

    it('returns 422 with a clear message when the provider gave no email', async () => {
      const req = mockRequest({}, { authorization: 'Bearer valid-token' });
      const res = mockResponse();

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'user-id', email: undefined } },
        error: null,
      });

      (accountMergeService.mergeOrCreate as any).mockRejectedValue(
        new accountMergeService.MissingProviderEmailError()
      );

      await customerOauthCallbackController(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('no confirmed email address'),
        })
      );
    });
  });
});
