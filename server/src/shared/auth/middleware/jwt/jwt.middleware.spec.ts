import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../../shared/shared.types';
import { jwtMiddleware } from './jwt.middleware';

import { supabase } from '../../../../config/supabase/supabase.config';

vi.mock('../../../../config/supabase/supabase.config', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe('jwt middleware', () => {
  it('attaches a user payload when the token is valid', async () => {
    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'staff-1' } },
      error: null,
    } as never);

    vi.spyOn(jwt, 'decode').mockReturnValue({
      sub: 'staff-1',
      role: 'Manager',
    } as never);

    await jwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ sub: 'staff-1', role: 'Manager' });
  });

  it('forwards an auth error when the token is missing', async () => {
    const req = { headers: {} } as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await jwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0] as Error & { statusCode?: number };
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Missing or malformed token');
  });

  it('forwards an auth error when the token is expired/invalid', async () => {
    const req = {
      headers: { authorization: 'Bearer expired-token' },
    } as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: new Error('jwt expired'),
    } as never);

    await jwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0] as Error & { statusCode?: number };
    expect(error.statusCode).toBe(401);
  });
});
