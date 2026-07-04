import type { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../../../shared/shared.types';
import { supabase } from '../../../../config/supabase/supabase.config';
import { requireBranch } from '../middleware/requireBranch/requireBranch.middleware';
import { requireRole } from '../middleware/requireRole/requireRole.middleware';
import { requireMfa } from '../middleware/requireMfa/requireMfa.middleware';

vi.mock('../../../../config/supabase/supabase.config', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('requireRole middleware', () => {
  let req: AuthenticatedRequest;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { user: { sub: 'staff-1' } } as AuthenticatedRequest;
    next = vi.fn();
  });

  it('allows access when staff_profiles.role is in the allow-list', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { role: 'Admin' }, error: null }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    await requireRole(['Admin', 'Superadmin'])(
      req,
      {} as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.role).toBe('Admin');
  });

  it('denies access when staff_profiles.role is not in the allow-list', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { role: 'Receptionist' }, error: null }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    await requireRole(['Admin', 'Superadmin'])(
      req,
      {} as Response,
      next as NextFunction
    );

    const error = next.mock.calls[0][0] as Error & { statusCode?: number };
    expect(error.statusCode).toBe(403);
  });
});

describe('requireBranch middleware', () => {
  let req: AuthenticatedRequest;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { user: { sub: 'staff-1' } } as AuthenticatedRequest;
    next = vi.fn();
  });

  it('attaches branch_id from staff_profiles for non-Superadmin roles', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'Receptionist', branch_id: 'branch-makati' },
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    await requireBranch(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.branch_id).toBe('branch-makati');
    expect(req.user?.role).toBe('Receptionist');
  });

  it('allows Superadmin without branch scoping restrictions', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'Superadmin', branch_id: 'branch-makati' },
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    await requireBranch(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.role).toBe('Superadmin');
    expect(req.user?.branch_id).toBe('branch-makati');
  });
});

describe('requireMfa middleware', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  it.each(['Admin', 'Supervisor'])(
    'blocks %s when the session is not aal2',
    async (role) => {
      const req = {
        user: { sub: 'staff-1', role, aal: 'aal1' },
      } as AuthenticatedRequest;

      await requireMfa(req, {} as Response, next as NextFunction);

      const error = next.mock.calls[0][0] as Error & { statusCode?: number };
      expect(error.message).toBe('MFA required');
      expect(error.statusCode).toBe(403);
    }
  );

  it.each(['Admin', 'Supervisor'])(
    'allows %s when the session is aal2',
    async (role) => {
      const req = {
        user: { sub: 'staff-1', role, aal: 'aal2' },
      } as AuthenticatedRequest;

      await requireMfa(req, {} as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
    }
  );

  it.each([
    'Receptionist',
    'Cashier',
    'Groomer',
    'Veterinarian',
    'Pet Assistant',
  ])('never blocks %s when the session is not aal2', async (role) => {
    const req = {
      user: { sub: 'staff-1', role, aal: 'aal1' },
    } as AuthenticatedRequest;

    await requireMfa(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  it('loads role from staff_profiles and still allows lower staff roles', async () => {
    const req = { user: { sub: 'staff-1', aal: 'aal1' } } as AuthenticatedRequest;
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'Cashier' },
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never);

    await requireMfa(req, {} as Response, next as NextFunction);

    expect(req.user?.role).toBe('Cashier');
    expect(next).toHaveBeenCalledWith();
  });
});
