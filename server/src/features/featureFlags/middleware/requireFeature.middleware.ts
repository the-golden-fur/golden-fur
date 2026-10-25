import type { NextFunction, Request, Response } from 'express';
import { isFeatureEnabled } from '../services/featureFlags.service.ts';
import type { FeatureFlagKey } from '../featureFlags.types.ts';

/**
 * Turns a whole group of endpoints off while its experimental feature is
 * switched off in Settings > Experimental. 404 rather than 403 - to a caller
 * the feature simply isn't there.
 */
export function requireFeature(key: FeatureFlagKey) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await isFeatureEnabled(key))) {
        return res.status(404).json({ error: 'Not found' });
      }
      return next();
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
