import type { NextFunction, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../shared.types.ts';
import { sessionTimeoutMiddleware } from './sessionTimeout.middleware';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('sessionTimeout middleware', () => {
  let req: AuthenticatedRequest;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = {
      user: {
        sub: 'staff-1',
        auth_time: Math.floor(Date.now() / 1000),
      },
    } as unknown as AuthenticatedRequest;
    next = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['Superadmin', 'Superadmin', 30 * 60 * 1000],
    ['Admin', 'Admin', 30 * 60 * 1000],
    ['Supervisor', 'Supervisor', 60 * 60 * 1000],
    ['Receptionist', 'Receptionist', 4 * 60 * 60 * 1000],
    ['Cashier', 'Cashier', 4 * 60 * 60 * 1000],
    ['Groomer', 'Groomer', 8 * 60 * 60 * 1000],
    ['Veterinarian', 'Veterinarian', 8 * 60 * 60 * 1000],
    ['Pet Assistant', 'Pet Assistant', 8 * 60 * 60 * 1000],
  ])(
    'expires %s sessions after their configured inactivity threshold',
    async (_label, role, thresholdMs) => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role }, error: null }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

      req.user = {
        ...req.user,
        auth_time: Math.floor((Date.now() - thresholdMs - 1) / 1000),
      };

      await sessionTimeoutMiddleware(req, {} as Response, next as NextFunction);

      const error = next.mock.calls[0][0] as Error & { statusCode?: number };
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('inactivity');
    }
  );

  it('allows sessions that are still within the role-specific threshold', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { role: 'Admin' }, error: null }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    req.user = {
      ...req.user,
      auth_time: Math.floor((Date.now() - 15 * 60 * 1000) / 1000),
    };

    await sessionTimeoutMiddleware(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.role).toBe('Admin');
  });

  it('skips customer sessions when no staff profile is found', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    await sessionTimeoutMiddleware(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });
});
