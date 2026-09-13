import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  archiveSpinWheelReward,
  createSpinWheelReward,
  getSpinWheelConfig,
  hardDeleteSpinWheelReward,
  listArchivedSpinWheelRewards,
  listSpinWheelRewards,
  restoreSpinWheelReward,
  updateSpinWheelConfig,
  updateSpinWheelReward,
} from './services/spinWheelConfig.service.ts';
import { listMyCoupons } from './services/customerCoupons.service.ts';
import {
  getMySpinCreditCount,
  listMySpinHistory,
  spin,
} from './services/spinWheel.service.ts';
import {
  createSpinWheelRewardValidator,
  spinRequestValidator,
  updateSpinWheelRewardValidator,
  upsertSpinWheelConfigValidator,
} from './modules/validators/rewards.validator.ts';

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

// ---------------------------------------------------------------------------
// Admin config (session 86)
// ---------------------------------------------------------------------------

export async function getSpinWheelConfigController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const config = await getSpinWheelConfig();
    return res.status(200).json({ config });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateSpinWheelConfigController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = upsertSpinWheelConfigValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const config = await updateSpinWheelConfig(requesterId, parsed.data);
    return res.status(200).json({ config });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listSpinWheelRewardsController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const rewards = await listSpinWheelRewards(
      req.query.include_inactive === 'true'
    );
    return res.status(200).json({ rewards });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedSpinWheelRewardsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const rewards = await listArchivedSpinWheelRewards();
    return res.status(200).json({ rewards });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createSpinWheelRewardController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createSpinWheelRewardValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const reward = await createSpinWheelReward(requesterId, parsed.data);
    return res.status(201).json({ reward });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateSpinWheelRewardController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updateSpinWheelRewardValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const reward = await updateSpinWheelReward(
      requesterId,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ reward });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveSpinWheelRewardController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archiveSpinWheelReward(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreSpinWheelRewardController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restoreSpinWheelReward(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteSpinWheelRewardController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteSpinWheelReward(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Customer-or-staff (jwtMiddleware only - ownership resolved in the service
// layer, same shape as credits.routes.ts's GET /credits/balances)
// ---------------------------------------------------------------------------

export async function getMySpinCreditsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const count = await getMySpinCreditCount({
      requesterId,
      customerId:
        typeof req.query.customer_id === 'string'
          ? req.query.customer_id
          : undefined,
    });
    return res.status(200).json({ available_spins: count });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function spinController(req: AuthenticatedRequest, res: Response) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = spinRequestValidator.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await spin({
      requesterId,
      customerId: parsed.data.customer_id,
    });
    return res.status(200).json({ result });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listMyCouponsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const coupons = await listMyCoupons({
      requesterId,
      customerId:
        typeof req.query.customer_id === 'string'
          ? req.query.customer_id
          : undefined,
    });
    return res.status(200).json({ coupons });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listMySpinHistoryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const history = await listMySpinHistory({
      requesterId,
      customerId:
        typeof req.query.customer_id === 'string'
          ? req.query.customer_id
          : undefined,
    });
    return res.status(200).json({ history });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
