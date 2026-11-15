import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { getDeveloperStats } from './services/developerStats.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

export async function developerStatsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    return res.status(200).json({ stats: await getDeveloperStats() });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
