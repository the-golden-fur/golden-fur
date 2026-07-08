import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../../../../../shared/shared.types.ts';
import { getStaffBranch } from '../../../../../shared/auth/api/supabaseAuth.api.ts';

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

  const { data, error } = await getStaffBranch(userId);

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
