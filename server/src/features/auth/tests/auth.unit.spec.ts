import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../../shared/shared.types';
import { jwtMiddleware } from '../middleware/jwt/jwt.middleware';

describe('jwt middleware', () => {
  it('attaches a user payload when the token is valid', () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    const req = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    vi.spyOn(jwt, 'verify').mockReturnValue({ sub: 'staff-1', role: 'Manager' } as never);

    jwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ sub: 'staff-1', role: 'Manager' });
  });

  it('forwards an auth error when the token is missing', () => {
    const req = { headers: {} } as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    jwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0] as Error & { statusCode?: number };
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Missing or malformed token');
  });

  it('forwards an auth error when the token is expired', () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    const req = { headers: { authorization: 'Bearer expired-token' } } as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    vi.spyOn(jwt, 'verify').mockImplementation(() => {
      throw new Error('jwt expired');
    });

    jwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0] as Error & { statusCode?: number };
    expect(error.statusCode).toBe(401);
  });
});
