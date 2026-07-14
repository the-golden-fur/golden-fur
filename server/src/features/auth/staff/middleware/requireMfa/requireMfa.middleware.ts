import type { NextFunction, Response } from 'express';
import { supabase } from '../../../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../../../../shared/shared.types.ts';

/** `staff_role` enum values (supabase/migrations/20260625004_m01_create_staff_role_enum.sql). */
const STAFF_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
]);

/** Roles that must complete TOTP (aal2) before touching MFA-gated routes. */
const MANDATORY_MFA_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

export async function requireMfa(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const userId = req.user?.sub;

  if (!userId) {
    const error = new Error('Unauthorized');
    (error as Error & { statusCode?: number }).statusCode = 401;
    return next(error);
  }

  let role = req.user?.role;

  // `req.user.role` is decoded straight from the JWT, where `role` is the
  // Postgres role claim (e.g. "authenticated") - not the staff_role enum.
  // Only trust it here if it's actually one of our known staff roles;
  // otherwise resolve it from staff_profiles.
  if (!role || !STAFF_ROLES.has(role)) {
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !data?.role) {
      const authError = new Error('Unauthorized');
      (authError as Error & { statusCode?: number }).statusCode = 401;
      return next(authError);
    }
    role = data.role;
    if (req.user) req.user.role = role;
  }

  if (MANDATORY_MFA_ROLES.has(role as string)) {
    const aal = req.user?.aal as string | undefined;

    if (aal !== 'aal2') {
      const forbiddenError = new Error('MFA required');
      (forbiddenError as Error & { statusCode?: number }).statusCode = 403;
      return next(forbiddenError);
    }
  }

  return next();
}
