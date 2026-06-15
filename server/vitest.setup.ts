import type { NextFunction, Request, Response } from 'express';
import { afterEach, vi } from 'vitest';

type MockExpressContext = {
  req: Partial<Request>;
  res: Partial<Response>;
  next: NextFunction;
};

declare global {
  // eslint-disable-next-line no-unused-vars
  var mockExpressContext: () => MockExpressContext;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

global.mockExpressContext = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.locals = {};

  const req: Partial<Request> = {};
  const next = vi.fn();

  return { req, res, next };
};

export {};
