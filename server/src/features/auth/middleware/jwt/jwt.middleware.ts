import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthenticatedRequest, JwtPayload } from '../../../../shared/shared.types.ts';

export function jwtMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing or malformed token');
    (error as Error & { statusCode?: number }).statusCode = 401;
    return next(error);
  }

  const token = authHeader.slice('Bearer '.length);
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret) {
    const error = new Error('JWT secret not configured');
    (error as Error & { statusCode?: number }).statusCode = 500;
    return next(error);
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
    return next();
  } catch (error) {
    const verificationError = error as Error & { statusCode?: number };
    verificationError.statusCode = 401;
    return next(verificationError);
  }
}
