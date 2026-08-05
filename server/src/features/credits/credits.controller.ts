import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  listCreditBalances,
  listCreditHistory,
} from './services/creditBalance.service.ts';
import { runCreditExpiryJob } from './services/creditExpiry.job.ts';
import {
  listCreditBalancesQueryValidator,
  listCreditHistoryQueryValidator,
} from './modules/validators/credits.validator.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

/**
 * Issue #95: a single role-branching endpoint pair (mirroring bookings' own
 * GET /bookings), open to customers AND staff via jwtMiddleware only - the
 * customer-scoped self-read requirement and the staff any-customer read
 * requirement are both satisfied by creditBalance.service.ts resolving
 * which customer_id is actually authorized, not by two separate route
 * surfaces.
 */
export async function listCreditBalancesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = listCreditBalancesQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const balances = await listCreditBalances({
      requesterId,
      customerId: parsed.data.customer_id,
    });

    return res.status(200).json({ balances });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listCreditHistoryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = listCreditHistoryQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const history = await listCreditHistory({
      requesterId,
      customerId: parsed.data.customer_id,
      branchId: parsed.data.branch_id,
    });

    return res.status(200).json({ history });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/**
 * Issue #93's manual-trigger mechanism, exposed here (Admin/Superadmin-only
 * at the route level) since credits.routes.ts didn't exist yet when #93 was
 * built - the primary mechanism, not just a verification aid, in any
 * environment without pg_cron.
 */
export async function runCreditExpiryController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const expiredCount = await runCreditExpiryJob();
    return res.status(200).json({ expired_count: expiredCount });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
