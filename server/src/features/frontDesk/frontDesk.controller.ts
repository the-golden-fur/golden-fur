import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { servicesDoneValidator } from '../veterinary/modules/validators/veterinary.validator.ts';
import {
  completeFrontDeskBooking,
  listFrontDeskQueue,
  startFrontDeskBooking,
} from './services/frontDeskQueue.service.ts';

const completeBodyValidator = z
  .object({ services_done: servicesDoneValidator.optional() })
  .strict();

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendServiceError(res: Response, error: unknown) {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return res.status(statusCode).json({ error: message });
}

/** Superadmin may look at another branch or all of them; everyone else is
 * locked to their own, whatever they send. */
function resolveListBranch(req: AuthenticatedRequest): string | null {
  const ownBranchId = req.user!.branch_id!;
  const requested = req.query?.branch_id;

  if (req.user?.role !== 'Superadmin' || typeof requested !== 'string') {
    return ownBranchId;
  }

  return requested === 'all' ? null : requested;
}

/** The branch a booking must be in to be advanced - null for Superadmin. */
function actionBranch(req: AuthenticatedRequest): string | null {
  return req.user?.role === 'Superadmin' ? null : req.user!.branch_id!;
}

export async function listFrontDeskQueueController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId || !req.user?.branch_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rows = await listFrontDeskQueue({
      requesterId,
      branchId: resolveListBranch(req),
    });

    return res.status(200).json({ rows });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function startFrontDeskBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId || !req.user?.branch_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await startFrontDeskBooking({
      bookingId: paramId(req, 'id'),
      requesterId,
      branchId: actionBranch(req),
    });

    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function completeFrontDeskBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId || !req.user?.branch_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = completeBodyValidator.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    await completeFrontDeskBooking({
      bookingId: paramId(req, 'id'),
      requesterId,
      branchId: actionBranch(req),
      servicesDone: parsed.data.services_done ?? [],
    });

    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
