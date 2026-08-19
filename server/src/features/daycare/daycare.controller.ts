import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  checkInDaycareSession,
  listDaycareSessions,
} from './services/daycareCheckIn.service.ts';
import { checkOutDaycareSession } from './services/daycareBilling.service.ts';
import {
  checkInValidator,
  listDaycareSessionsQueryValidator,
} from './modules/validators/daycare.validator.ts';

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
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

export async function checkInDaycareSessionController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = checkInValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const session = await checkInDaycareSession({
      requesterId,
      input: parsed.data,
    });

    return res.status(201).json({ session });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listDaycareSessionsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = listDaycareSessionsQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const sessions = await listDaycareSessions({
      branchId,
      status: parsed.data.status,
      dateFrom: parsed.data.date_from,
      dateTo: parsed.data.date_to,
    });
    return res.status(200).json({ sessions });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function checkOutDaycareSessionController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const session = await checkOutDaycareSession({
      sessionId: paramId(req, 'id'),
      requesterId,
    });

    return res.status(200).json({ session });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
