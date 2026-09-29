import type { Request, Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  mfaEnrollController,
  mfaEmailRequestCodeController,
  mfaStatusController,
  mfaUnenrollController,
  mfaVerifyController,
  staffLoginController,
} from '../staffAuth.controller';
import { supabase } from '../../../../config/supabase/supabase.config';
import * as mfaLockoutService from '../../../../shared/services/mfaLockout/mfaLockout.service.ts';
import * as mfaMethodsService from '../../../../shared/services/mfaMethods/mfaMethods.service.ts';
import * as mfaPreferenceService from '../../../../shared/services/mfaPreference/mfaPreference.service.ts';
import * as trustedDeviceService from '../../../../shared/services/trustedDevice/trustedDevice.service.ts';
import * as supabaseAuthApi from '../../../../shared/auth/api/supabaseAuth.api.ts';

vi.mock('../../../../config/supabase/supabase.config', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
    },
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
  },
};

const mockSignInClient = {
  auth: {
    signInWithPassword: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  // getUserClient() passes a third `options` arg (forwarding the caller's
  // bearer token); createSignInClient() doesn't - use that to tell them apart.
  createClient: vi.fn((..._args: unknown[]) =>
    _args.length > 2 ? mockUserClient : mockSignInClient
  ),
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

// The controller now orchestrates through these services (which each have
// their own dedicated spec file covering the real Supabase/otplib/crypto
// logic) rather than calling userClient.auth.mfa.* directly - mocked here so
// these tests stay focused on the controller's own request/response mapping.
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
    return {
      ...actual,
      getStaffRole: vi.fn(),
      getAuthUserEmail: vi.fn(),
      resolveStaffLoginIdentifier: actual.resolveStaffLoginIdentifier,
      signInWithPassword: actual.signInWithPassword,
    };
  }
);

describe('staffLoginController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let json: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    json = vi.fn();
    status = vi.fn().mockReturnValue({ json });
    req = { body: {} };
    res = { status };
  });

  it('returns 401 for invalid payload', async () => {
    req.body = { username: 'testuser' }; // Missing password
    await staffLoginController(req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when profile is not found', async () => {
    req.body = { username: 'testuser', password: 'password123' };
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: new Error('Not found') }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    await staffLoginController(req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when password is wrong', async () => {
    req.body = { username: 'testuser', password: 'wrong-password' };
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { registered_email: 'test@example.com' },
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid login credentials'),
    } as any);

    await staffLoginController(req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('returns tokens on successful login', async () => {
    req.body = { username: 'testuser', password: 'password123' };
    const mockSelect = vi.fn((columns: string) => ({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(
          columns === 'role'
            ? { data: { role: 'Groomer' }, error: null }
            : {
                data: { registered_email: 'test@example.com' },
                error: null,
              }
        ),
      }),
    }));
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);
    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Groomer' },
      error: null,
    } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'staff-1' },
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    await staffLoginController(req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      access_token: 'acc',
      refresh_token: 'ref',
      expires_in: 3600,
    });
  });

  it('signs in directly when the staff identifier is an email', async () => {
    req.body = { identifier: 'test@example.com', password: 'password123' };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { role: 'Admin' }, error: null }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);
    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Admin' },
      error: null,
    } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'staff-1' },
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    await staffLoginController(req as Request, res as Response);

    expect(mockSignInClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('rejects login when the authenticated account has no staff_profiles row (cross-role login via email identifier)', async () => {
    req.body = { identifier: 'customer@example.com', password: 'password123' };

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any);
    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: null,
      error: new Error('Not found'),
    } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'customer-1' },
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    await staffLoginController(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});

describe('mfaVerifyController', () => {
  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

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

  it('returns 423 without verifying when the staff user is locked out', async () => {
    const req = {
      body: { code: '123456' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaLockoutService.checkMfaLockout).mockResolvedValue({
      locked: true,
      lockedUntil: '2026-07-04T00:15:00.000Z',
      retryAfterSeconds: 900,
      failedAttempts: 5,
    });

    await mfaVerifyController(req, res);

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

  it('defaults to the authenticator method and rejects a wrong code, incrementing lockout', async () => {
    const req = {
      body: { code: '123456' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaMethodsService.challengeAndVerifyMfaMethod).mockResolvedValue({
      verifyError: { message: 'Invalid code' },
    });

    await mfaVerifyController(req, res);

    expect(mfaMethodsService.challengeAndVerifyMfaMethod).toHaveBeenCalledWith(
      mockUserClient,
      'staff-id',
      'authenticator',
      '123456'
    );
    expect(mfaLockoutService.incrementMfaLockout).toHaveBeenCalledWith(
      'staff-id'
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('resets lockout and returns a refreshed session when the code is correct', async () => {
    const req = {
      body: { code: '123456', method: 'email' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaMethodsService.challengeAndVerifyMfaMethod).mockResolvedValue({
      verifyError: null,
    });
    mockUserClient.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await mfaVerifyController(req, res);

    expect(mfaMethodsService.challengeAndVerifyMfaMethod).toHaveBeenCalledWith(
      mockUserClient,
      'staff-id',
      'email',
      '123456'
    );
    expect(mfaLockoutService.resetMfaLockout).toHaveBeenCalledWith('staff-id');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 400 when the chosen method has no resolvable factor', async () => {
    const req = {
      body: { code: '123456', method: 'email' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaMethodsService.challengeAndVerifyMfaMethod).mockResolvedValue(
      null
    );

    await mfaVerifyController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No email factor found' });
  });

  it('issues a trusted-device token when remember_device is set and the role is not mandatory', async () => {
    const req = {
      body: { code: '123456', remember_device: true },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaMethodsService.challengeAndVerifyMfaMethod).mockResolvedValue({
      verifyError: null,
    });
    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Groomer' },
      error: null,
    } as any);
    vi.mocked(trustedDeviceService.issueTrustedDeviceToken).mockResolvedValue(
      'raw-device-token'
    );
    mockUserClient.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await mfaVerifyController(req, res);

    expect(trustedDeviceService.issueTrustedDeviceToken).toHaveBeenCalledWith(
      'staff-id'
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      device_token: 'raw-device-token',
    });
  });

  it('never issues a trusted-device token for a mandatory-MFA role, even if remember_device is set', async () => {
    const req = {
      body: { code: '123456', remember_device: true },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaMethodsService.challengeAndVerifyMfaMethod).mockResolvedValue({
      verifyError: null,
    });
    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Admin' },
      error: null,
    } as any);
    mockUserClient.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await mfaVerifyController(req, res);

    expect(trustedDeviceService.issueTrustedDeviceToken).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});

describe('mfaEnrollController', () => {
  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enrolls the authenticator method by default and returns its QR/secret', async () => {
    const req = {
      body: {},
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
      'staff@example.com'
    );
    vi.mocked(mfaMethodsService.enrollMfaMethod).mockResolvedValue({
      factorId: 'fresh-factor',
      totp: { qr_code: 'data:...', secret: 'SECRET' },
    });

    await mfaEnrollController(req, res);

    expect(mfaMethodsService.enrollMfaMethod).toHaveBeenCalledWith(
      mockUserClient,
      'staff-id',
      'authenticator',
      'staff@example.com'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 'fresh-factor',
      totp: { qr_code: 'data:...', secret: 'SECRET' },
    });
  });

  it('enrolls the email method and does not echo a secret in the response', async () => {
    const req = {
      body: { method: 'email' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
      'staff@example.com'
    );
    vi.mocked(mfaMethodsService.enrollMfaMethod).mockResolvedValue({
      factorId: 'email-factor',
    });

    await mfaEnrollController(req, res);

    expect(mfaMethodsService.enrollMfaMethod).toHaveBeenCalledWith(
      mockUserClient,
      'staff-id',
      'email',
      'staff@example.com'
    );
    expect(res.json).toHaveBeenCalledWith({ id: 'email-factor', sent: true });
  });
});

describe('mfaEmailRequestCodeController', () => {
  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a code and returns 200', async () => {
    const req = {
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
      'staff@example.com'
    );
    vi.mocked(mfaMethodsService.sendMfaEmailMethodCode).mockResolvedValue({
      status: 'sent',
    });

    await mfaEmailRequestCodeController(req, res);

    expect(mfaMethodsService.sendMfaEmailMethodCode).toHaveBeenCalledWith(
      'staff-id',
      'staff@example.com'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sent: true });
  });

  it('returns 429 with a retry hint when rate-limited', async () => {
    const req = {
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
      'staff@example.com'
    );
    vi.mocked(mfaMethodsService.sendMfaEmailMethodCode).mockResolvedValue({
      status: 'rate_limited',
      retryAfterSeconds: 12,
    });

    await mfaEmailRequestCodeController(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ retry_after_seconds: 12 })
    );
  });

  it('returns 400 when the email method is not set up', async () => {
    const req = {
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getAuthUserEmail).mockResolvedValue(
      'staff@example.com'
    );
    vi.mocked(mfaMethodsService.sendMfaEmailMethodCode).mockResolvedValue({
      status: 'not_configured',
    });

    await mfaEmailRequestCodeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('mfaUnenrollController', () => {
  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the request has no authenticated user', async () => {
    const req = {
      body: {},
      headers: { authorization: 'Bearer staff-token' },
    } as any;
    const res = mockResponse();

    await mfaUnenrollController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('removes the given method for a non-mandatory role', async () => {
    const req = {
      body: { method: 'authenticator' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Groomer' },
      error: null,
    } as any);
    vi.mocked(mfaMethodsService.unenrollMfaMethod).mockResolvedValue({
      error: null,
    });

    await mfaUnenrollController(req, res);

    expect(mfaMethodsService.unenrollMfaMethod).toHaveBeenCalledWith(
      mockUserClient,
      'staff-id',
      'authenticator'
    );
    expect(trustedDeviceService.revokeAllTrustedDevices).toHaveBeenCalledWith(
      'staff-id'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ removed: true });
  });

  it('returns 400 when Supabase refuses to remove the factor (e.g. missing aal2)', async () => {
    const req = {
      body: { method: 'authenticator' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Groomer' },
      error: null,
    } as any);
    vi.mocked(mfaMethodsService.unenrollMfaMethod).mockResolvedValue({
      error: { message: 'AAL2 required' },
    });

    await mfaUnenrollController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to remove MFA factor',
      details: 'AAL2 required',
    });
  });

  it('rejects removing the authenticator method for a mandatory-MFA role, even when email is also enrolled', async () => {
    const req = {
      body: { method: 'authenticator' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Admin' },
      error: null,
    } as any);

    await mfaUnenrollController(req, res);

    // The authenticator factor is permanent for a mandatory role - this is
    // checked before even looking at getMfaMethodStatus, since it's never
    // negotiable regardless of what else is enrolled.
    expect(mfaMethodsService.getMfaMethodStatus).not.toHaveBeenCalled();
    expect(mfaMethodsService.unenrollMfaMethod).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('allows a mandatory-MFA role to remove email as long as authenticator is enrolled', async () => {
    const req = {
      body: { method: 'email' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Admin' },
      error: null,
    } as any);
    vi.mocked(mfaMethodsService.getMfaMethodStatus).mockResolvedValue({
      authenticator: true,
      email: true,
    });
    vi.mocked(mfaMethodsService.unenrollMfaMethod).mockResolvedValue({
      error: null,
    });

    await mfaUnenrollController(req, res);

    expect(mfaMethodsService.unenrollMfaMethod).toHaveBeenCalledWith(
      mockUserClient,
      'staff-id',
      'email'
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a mandatory-MFA role removing email if authenticator is somehow not enrolled (defensive check)', async () => {
    const req = {
      body: { method: 'email' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Admin' },
      error: null,
    } as any);
    vi.mocked(mfaMethodsService.getMfaMethodStatus).mockResolvedValue({
      authenticator: false,
      email: true,
    });

    await mfaUnenrollController(req, res);

    expect(mfaMethodsService.unenrollMfaMethod).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('mfaStatusController', () => {
  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the request has no authenticated user', async () => {
    const req = { headers: { authorization: 'Bearer staff-token' } } as any;
    const res = mockResponse();

    await mfaStatusController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns role, methods, preferred_method, and a back-compat mfa_enrolled', async () => {
    const req = {
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    vi.mocked(mfaMethodsService.getMfaMethodStatus).mockResolvedValue({
      authenticator: false,
      email: true,
    });
    vi.mocked(supabaseAuthApi.getStaffRole).mockResolvedValue({
      data: { role: 'Admin' },
      error: null,
    } as any);
    vi.mocked(mfaPreferenceService.getMfaPreference).mockResolvedValue('email');

    await mfaStatusController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      role: 'Admin',
      mfa_enrolled: true,
      methods: { authenticator: false, email: true },
      preferred_method: 'email',
    });
  });
});
