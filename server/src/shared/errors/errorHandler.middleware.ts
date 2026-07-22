import type { NextFunction, Request, Response } from 'express';
import { AppError } from './AppError.ts';
import { ValidationError } from './ValidationError.ts';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    const body: { error: string; code: string; details?: unknown } = {
      error: err.message,
      code: err.code,
    };

    if (err instanceof ValidationError && err.details !== undefined) {
      body.details = err.details;
    }

    return res.status(err.statusCode).json(body);
  }

  // Epics A, A-1, and B throw a plain `Error` with a manually bolted-on
  // `.statusCode` (see requireMfa.middleware.ts, requireRole.middleware.ts,
  // staffAuth.controller.ts). Per the Guide's Out of Scope section, those
  // call sites are not retrofitted to the AppError hierarchy in this issue,
  // so this still has to honor `.statusCode` - otherwise every one of their
  // 401/403 rejections would regress to a generic 500.
  if (
    err instanceof Error &&
    'statusCode' in err &&
    typeof (err as Error & { statusCode?: unknown }).statusCode === 'number'
  ) {
    const legacyStatusCode = (err as Error & { statusCode: number }).statusCode;
    return res.status(legacyStatusCode).json({ error: err.message });
  }

  console.error(err); // eslint-disable-line no-console

  return res
    .status(500)
    .json({ error: 'Internal server error', code: 'SERVER_ERROR' });
}
