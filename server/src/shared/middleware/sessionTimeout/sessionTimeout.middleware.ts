import type { NextFunction, Response } from 'express';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest, JwtPayload } from '../../shared.types.ts';

const ROLE_TIMEOUT_MS: Record<string, number> = {
  Superadmin: 30 * 60 * 1000,
  Admin: 30 * 60 * 1000,
  Supervisor: 60 * 60 * 1000,
  Receptionist: 4 * 60 * 60 * 1000,
  Cashier: 4 * 60 * 60 * 1000,
  Groomer: 8 * 60 * 60 * 1000,
  Veterinarian: 8 * 60 * 60 * 1000,
  'Pet Assistant': 8 * 60 * 60 * 1000,
};

export async function sessionTimeoutMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const currentTimeMs = Date.now();
  const authTime = req.user?.auth_time;

  if (typeof authTime !== 'number') {
    return next();
  }

  const authTimestampMs = authTime * 1000;
  const elapsedMs = currentTimeMs - authTimestampMs;

  const userId = req.user?.sub;
  if (!userId) {
    return next();
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data?.role) {
    return next();
  }

  const timeoutMs = ROLE_TIMEOUT_MS[data.role];
  if (typeof timeoutMs !== 'number') {
    return next();
  }

  if (elapsedMs > timeoutMs) {
    const timeoutError = new Error('Session expired due to inactivity');
    (timeoutError as Error & { statusCode?: number }).statusCode = 401;
    return next(timeoutError);
  }

  const updatedUser: JwtPayload = {
    ...(req.user ?? {}),
    sub: userId,
    role: data.role,
  };

  req.user = updatedUser;

  return next();
}
