import type { NextFunction, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '../../../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../../../../shared/shared.types.ts';
import { requireMfa } from './requireMfa.middleware.ts';

vi.mock('../../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('requireMfa middleware', () => {
  it('trusts a Receptionist role claim from the JWT without an MFA challenge', async () => {
    const req = {
      user: { sub: 'staff-1', role: 'Receptionist' },
    } as unknown as AuthenticatedRequest;
    const next = vi.fn();

    await requireMfa(req, {} as Response, next as NextFunction);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks a Front Desk caller who has not reached aal2', async () => {
    const req = {
      user: { sub: 'staff-1', role: 'Front Desk', aal: 'aal1' },
    } as unknown as AuthenticatedRequest;
    const next = vi.fn();

    await requireMfa(req, {} as Response, next as NextFunction);

    const error = next.mock.calls[0][0] as Error & { statusCode?: number };
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('MFA required');
  });

  it('lets a Front Desk caller through once they have reached aal2', async () => {
    const req = {
      user: { sub: 'staff-1', role: 'Front Desk', aal: 'aal2' },
    } as unknown as AuthenticatedRequest;
    const next = vi.fn();

    await requireMfa(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });
});
