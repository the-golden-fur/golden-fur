import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireFeature } from './requireFeature.middleware.ts';
import { isFeatureEnabled } from '../services/featureFlags.service.ts';

vi.mock('../services/featureFlags.service.ts', () => ({
  isFeatureEnabled: vi.fn(),
}));

function mockResponse() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('requireFeature', () => {
  it('404s while the feature is switched off', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await requireFeature('spin_wheel')({} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through while the feature is on', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await requireFeature('spin_wheel')({} as Request, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
