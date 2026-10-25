import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  listFeatureFlags,
  setFeatureFlag,
} from './services/featureFlags.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

const updateFeatureFlagValidator = z.object({ enabled: z.boolean() }).strict();

/** No auth (see featureFlags.routes.ts) - every shell, signed in or not,
 * needs to know which experimental features to show. */
export async function getFeatureFlagsController(_req: Request, res: Response) {
  try {
    return res.status(200).json({ flags: await listFeatureFlags() });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateFeatureFlagController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updateFeatureFlagValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : (rawKey as string);

  try {
    return res.status(200).json({
      flags: await setFeatureFlag({
        key,
        enabled: parsed.data.enabled,
        requesterId,
      }),
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
