import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errorHandler.middleware.ts';
import { AppError } from './AppError.ts';
import { NotFoundError } from './NotFoundError.ts';
import { ValidationError } from './ValidationError.ts';
import { UnauthorizedError } from './UnauthorizedError.ts';
import { ForbiddenError } from './ForbiddenError.ts';
import { ConflictError } from './ConflictError.ts';

describe('errorHandler', () => {
  it('responds with 404 and the message for NotFoundError', () => {
    const { req, res, next } = global.mockExpressContext();

    errorHandler(new NotFoundError('Pet not found'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Pet not found' });
  });

  it('responds with 401 for UnauthorizedError', () => {
    const { req, res, next } = global.mockExpressContext();

    errorHandler(new UnauthorizedError(), req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('responds with 403 for ForbiddenError', () => {
    const { req, res, next } = global.mockExpressContext();

    errorHandler(new ForbiddenError(), req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('responds with 409 for ConflictError', () => {
    const { req, res, next } = global.mockExpressContext();

    errorHandler(new ConflictError('Already exists'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Already exists' });
  });

  it('responds with 400 and details for ValidationError with details', () => {
    const { req, res, next } = global.mockExpressContext();
    const details = [{ path: 'email', message: 'Invalid email' }];

    errorHandler(
      new ValidationError('Invalid payload', details),
      req,
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid payload',
      details,
    });
  });

  it('omits details for ValidationError without details', () => {
    const { req, res, next } = global.mockExpressContext();

    errorHandler(new ValidationError('Invalid payload'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid payload' });
  });

  it('responds with a subclass-specific status via the AppError base check', () => {
    const { req, res, next } = global.mockExpressContext();

    errorHandler(new AppError('Custom failure', 418), req, res, next);

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ error: 'Custom failure' });
  });

  it('honors a legacy-style Error with a manually attached statusCode (pre-Issue #37 call sites)', () => {
    const { req, res, next } = global.mockExpressContext();
    const legacyError = new Error('MFA required');
    (legacyError as Error & { statusCode?: number }).statusCode = 403;

    errorHandler(legacyError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'MFA required' });
  });

  it('responds with a generic 500 and no leaked internals for an unrecognized Error', () => {
    const { req, res, next } = global.mockExpressContext();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(new Error('unexpected database failure'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: 'unexpected database failure' })
    );
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('responds with a generic 500 for a thrown non-Error value', () => {
    const { req, res, next } = global.mockExpressContext();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler('a plain string was thrown', req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });

    consoleSpy.mockRestore();
  });
});
