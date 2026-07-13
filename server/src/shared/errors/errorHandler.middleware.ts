import type { NextFunction, Request, Response } from 'express';
import { AppError } from './AppError.ts';
import { ValidationError } from './ValidationError.ts';

// Pre-Issue #37 code (requireMfa.middleware.ts, requireRole.middleware.ts,
// jwtMiddleware, ...) throws a plain Error with a manually attached
// `statusCode`, relying on Express's default error handler to read it.
// That call-site pattern is explicitly out of scope to rewrite here, so
// this handler must keep honoring it - otherwise adding this middleware
// would silently turn all of those intentional 401s/403s into 500s.
function getLegacyStatusCode(err: unknown): number | undefined {
  if (!(err instanceof Error) || !('statusCode' in err)) {
    return undefined;
  }

  const statusCode = (err as Error & { statusCode?: unknown }).statusCode;

  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600
    ? statusCode
    : undefined;
}

// Express only recognizes error-handling middleware by its 4-argument
// signature - _next must stay declared even though it's unused.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    const body: { error: string; details?: unknown } = { error: err.message };

    if (err instanceof ValidationError && err.details !== undefined) {
      body.details = err.details;
    }

    return res.status(err.statusCode).json(body);
  }

  const legacyStatusCode = getLegacyStatusCode(err);

  if (legacyStatusCode !== undefined) {
    return res.status(legacyStatusCode).json({ error: (err as Error).message });
  }

  console.error(err); // eslint-disable-line no-console

  return res.status(500).json({ error: 'Internal server error' });
}
