import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../../../../../shared/shared.types.ts';
import { getStaffRole } from '../../../../../shared/auth/api/supabaseAuth.api.ts';

export function requireRole(allowedRoles: string[]) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.sub;

    if (!userId) {
      const error = new Error('Unauthorized');
      (error as Error & { statusCode?: number }).statusCode = 401;
      return next(error);
    }

    const { data, error } = await getStaffRole(userId);

    if (error || !data?.role || !allowedRoles.includes(data.role)) {
      const forbiddenError = new Error('Forbidden');
      (forbiddenError as Error & { statusCode?: number }).statusCode = 403;
      return next(forbiddenError);
    }

    req.user = {
      ...(req.user ?? { sub: userId }),
      sub: userId,
      role: data.role,
    };

    return next();
  };
}
