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
  it('trusts a Front Desk role claim from the JWT without an MFA challenge', async () => {
    const req = {
      user: { sub: 'staff-1', role: 'Front Desk' },
    } as unknown as AuthenticatedRequest;
    const next = vi.fn();

    await requireMfa(req, {} as Response, next as NextFunction);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
