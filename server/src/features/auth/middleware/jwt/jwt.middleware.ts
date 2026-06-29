import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import type {
  AuthenticatedRequest,
  JwtPayload,
} from '../../../../shared/shared.types.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

export async function jwtMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (
    !authHeader ||
    typeof authHeader !== 'string' ||
    !authHeader.startsWith('Bearer ')
  ) {
    const error = new Error('Missing or malformed token');
    (error as Error & { statusCode?: number }).statusCode = 401;
    return next(error);
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    // We use getUser to reliably verify the ES256 signature and check if token is valid
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      const error = new Error('Invalid token');
      (error as Error & { statusCode?: number }).statusCode = 401;
      return next(error);
    }

    // Decode to extract JWT claims safely (verified by getUser)
    const decoded = jwt.decode(token) as JwtPayload | null;

    if (!decoded) {
      const error = new Error('Could not decode token');
      (error as Error & { statusCode?: number }).statusCode = 401;
      return next(error);
    }

    req.user = decoded;
    return next();
  } catch (error) {
    const verificationError = error as Error & { statusCode?: number };
    verificationError.statusCode = 401;
    return next(verificationError);
  }
}
