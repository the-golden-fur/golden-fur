import { afterEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

type MockExpressContext = {
  req: Partial<Request>;
  res: Partial<Response>;
  next: NextFunction;
};

declare global {
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
