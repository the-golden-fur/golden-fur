import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface JwtPayload {
  sub: string;
  role?: string;
  branch_id?: string;
  [key: string]: unknown;
}
