import type { NextFunction, Response } from 'express';
import { supabase } from '../../../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../../../../shared/shared.types.ts';

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

  if (!role) {
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

  if (role === 'Admin' || role === 'Supervisor') {
    const aal = req.user?.aal as string | undefined;

    if (aal !== 'aal2') {
      const forbiddenError = new Error('MFA required');
      (forbiddenError as Error & { statusCode?: number }).statusCode = 403;
      return next(forbiddenError);
    }
  }

  return next();
}
