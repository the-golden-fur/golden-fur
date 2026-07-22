import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errorHandler.middleware.ts';
import { AppError } from './AppError.ts';
import { NotFoundError } from './NotFoundError.ts';
import { ValidationError } from './ValidationError.ts';
import { UnauthorizedError } from './UnauthorizedError.ts';
import { ForbiddenError } from './ForbiddenError.ts';
import { ConflictError } from './ConflictError.ts';
import { InternalServerError } from './InternalServerError.ts';

function createRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('errorHandler', () => {
  it.each([
    [new NotFoundError('Pet not found'), 404, 'Pet not found', 'NOT_FOUND'],
    [new UnauthorizedError(), 401, 'Unauthorized', 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'Forbidden', 'FORBIDDEN'],
    [new ConflictError('Duplicate email'), 409, 'Duplicate email', 'CONFLICT'],
    [
      new InternalServerError('Storage getPublicUrl failed'),
      500,
      'Storage getPublicUrl failed',
      'SERVER_ERROR',
    ],
  ])(
    'maps %#: %s to its statusCode and { error, code } body',
    (error, statusCode, message, code) => {
      const res = createRes();
      const next = vi.fn();

      errorHandler(error, {} as Request, res, next);

      expect(res.status).toHaveBeenCalledWith(statusCode);
      expect(res.json).toHaveBeenCalledWith({ error: message, code });
    }
  );

  it('includes details for ValidationError', () => {
    const res = createRes();
    const next = vi.fn();
    const details = [{ path: ['name'], message: 'Required' }];

    errorHandler(
      new ValidationError('Invalid payload', details),
      {} as Request,
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid payload',
      code: 'VALIDATION_ERROR',
      details,
    });
  });

  it('omits details from ValidationError when none were given', () => {
    const res = createRes();
    const next = vi.fn();

    errorHandler(
      new ValidationError('Invalid payload'),
      {} as Request,
      res,
      next
    );

    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid payload',
      code: 'VALIDATION_ERROR',
    });
  });

  it('honors a legacy ad hoc `.statusCode` on a plain Error (pre-Epic-D pattern)', () => {
    const res = createRes();
    const next = vi.fn();
    const legacyError = new Error('Forbidden') as Error & {
      statusCode?: number;
    };
    legacyError.statusCode = 403;

    errorHandler(legacyError, {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('falls back to 500 with a generic message for an unrecognized Error', () => {
    const res = createRes();
    const next = vi.fn();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    errorHandler(
      new Error('raw db failure: leaked stack trace'),
      {} as Request,
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'SERVER_ERROR',
    });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('falls back to 500 for a thrown non-Error value', () => {
    const res = createRes();
    const next = vi.fn();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    errorHandler('a string was thrown', {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'SERVER_ERROR',
    });

    consoleErrorSpy.mockRestore();
  });

  it('AppError subclasses are instanceof AppError', () => {
    expect(new NotFoundError()).toBeInstanceOf(AppError);
    expect(new ValidationError()).toBeInstanceOf(AppError);
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
    expect(new ConflictError()).toBeInstanceOf(AppError);
    expect(new InternalServerError()).toBeInstanceOf(AppError);
  });
});
