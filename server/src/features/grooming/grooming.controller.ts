import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  listGroomingQueue,
  transitionGroomingSessionStatus,
} from './services/grooming.service.ts';
import { transitionGroomingStatusValidator } from './modules/validators/grooming.validator.ts';

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

function queryDate(
  req: AuthenticatedRequest,
  name: string
): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

export async function listGroomingQueueController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterId || !requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dateFrom = queryDate(req, 'date_from');
  const dateTo = queryDate(req, 'date_to');

  try {
    const sessions = await listGroomingQueue({
      requesterId,
      requesterRole,
      requesterBranchId,
      dateFrom,
      dateTo,
    });

    return res.status(200).json({ sessions });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function transitionGroomingStatusController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = transitionGroomingStatusValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const session = await transitionGroomingSessionStatus({
      requesterId,
      requesterRole,
      sessionId: paramId(req, 'id'),
      targetStatus: parsed.data.status,
    });

    return res.status(200).json({ session });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
