import type { Request, Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { staffLoginController } from '../staffAuth.controller';
import { supabase } from '../../../../config/supabase/supabase.config';

vi.mock('../../../../config/supabase/supabase.config', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}));

describe('staffLoginController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let json: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') }) }) });
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
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { registered_email: 'test@example.com' }, error: null }) }) });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 } },
      error: null,
    } as any);

    await staffLoginController(req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 });
  });
});
