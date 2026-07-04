import type { Request, Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  mfaVerifyController,
  staffLoginController,
} from '../staffAuth.controller';
import { supabase } from '../../../../config/supabase/supabase.config';
import * as mfaLockoutService from '../../../../shared/services/mfaLockout/mfaLockout.service.ts';

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
      listFactors: vi.fn(),
      challenge: vi.fn(),
      verify: vi.fn(),
    },
    refreshSession: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockUserClient),
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

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid login credentials'),
    } as any);

    await staffLoginController(req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('returns tokens on successful login', async () => {
    req.body = { username: 'testuser', password: 'password123' };
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { registered_email: 'test@example.com' },
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: {
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

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: {
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    await staffLoginController(req as Request, res as Response);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(status).toHaveBeenCalledWith(200);
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
    expect(mockUserClient.auth.mfa.listFactors).not.toHaveBeenCalled();
  });

  it('increments lockout attempts when the staff TOTP code is invalid', async () => {
    const req = {
      body: { code: '123456' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    mockUserClient.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-id', status: 'verified' }] },
      error: null,
    });
    mockUserClient.auth.mfa.challenge.mockResolvedValue({
      data: { id: 'challenge-id' },
      error: null,
    });
    mockUserClient.auth.mfa.verify.mockResolvedValue({
      error: new Error('Invalid code'),
    });

    await mfaVerifyController(req, res);

    expect(mfaLockoutService.incrementMfaLockout).toHaveBeenCalledWith(
      'staff-id'
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('resets lockout attempts when staff TOTP verification succeeds', async () => {
    const req = {
      body: { code: '123456' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as any;
    const res = mockResponse();

    mockUserClient.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-id', status: 'verified' }] },
      error: null,
    });
    mockUserClient.auth.mfa.challenge.mockResolvedValue({
      data: { id: 'challenge-id' },
      error: null,
    });
    mockUserClient.auth.mfa.verify.mockResolvedValue({ error: null });
    mockUserClient.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await mfaVerifyController(req, res);

    expect(mfaLockoutService.resetMfaLockout).toHaveBeenCalledWith('staff-id');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
