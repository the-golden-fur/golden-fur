import type { NextFunction, Response } from 'express';
import { supabase } from '../../../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../../../../shared/shared.types.ts';

export async function requireBranch(
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

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('role, branch_id')
    .eq('id', userId)
    .single();

  if (error || !data?.role || !data?.branch_id) {
    const forbiddenError = new Error('Forbidden');
    (forbiddenError as Error & { statusCode?: number }).statusCode = 403;
    return next(forbiddenError);
  }

  req.user = {
    ...(req.user ?? { sub: userId }),
    sub: userId,
    role: data.role,
    branch_id: data.branch_id,
  };

  return next();
}
