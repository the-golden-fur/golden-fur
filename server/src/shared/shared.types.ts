import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface JwtPayload {
  sub: string;
  role?: string;
  branch_id?: string;
  auth_time?: number;
  [key: string]: unknown;
}
