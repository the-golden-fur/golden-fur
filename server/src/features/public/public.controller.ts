import type { Request, Response } from 'express';
import { getPublicPackagesPromos } from './services/publicCatalog.service.ts';

/**
 * No requireRole/jwtMiddleware in front of this one (see public.routes.ts) -
 * intentionally reachable by a logged-out visitor, so errors are formatted
 * the same way maintenance.controller.ts's sendServiceError does rather than
 * relying on the global errorHandler, which this route doesn't route into.
 */
export async function packagesPromosController(_req: Request, res: Response) {
  try {
    const result = await getPublicPackagesPromos();
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
    const message =
      statusCode === 500
        ? 'Internal server error'
        : ((error as Error).message ?? 'Request failed');

    return res.status(statusCode).json({ error: message });
  }
}
