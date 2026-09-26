import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  archiveSpinWheelReward,
  createSpinWheelReward,
  hardDeleteSpinWheelReward,
  listArchivedSpinWheelRewards,
  listSpinWheelRewards,
  restoreSpinWheelReward,
  updateSpinWheelReward,
} from './services/spinWheelRewards.service.ts';
import {
  archiveRewardPool,
  createRewardPool,
  getRewardPoolById,
  hardDeleteRewardPool,
  listArchivedRewardPools,
  listRewardPools,
  restoreRewardPool,
  updateRewardPool,
} from './services/rewardPools.service.ts';
import { listMyCoupons } from './services/customerCoupons.service.ts';
import { recordCheckIn } from './services/checkIn.service.ts';
import {
  getMySpinCredits,
  getPromoWheel,
  listMySpinHistory,
  spin,
} from './services/spinWheel.service.ts';
import {
  createRewardPoolValidator,
  createSpinWheelRewardValidator,
  spinRequestValidator,
  updateRewardPoolValidator,
  updateSpinWheelRewardValidator,
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

function queryCustomerId(req: AuthenticatedRequest): string | undefined {
  return typeof req.query.customer_id === 'string'
    ? req.query.customer_id
    : undefined;
}

// ---------------------------------------------------------------------------
// Reward catalog admin (Settings > Promos & Rewards > Rewards)
// ---------------------------------------------------------------------------

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
// Reward pools admin (Settings > Promos & Rewards > Reward Pools, session 114)
// ---------------------------------------------------------------------------

export async function listRewardPoolsController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const pools = await listRewardPools(req.query.active_only !== 'true');
    return res.status(200).json({ pools });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedRewardPoolsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const pools = await listArchivedRewardPools();
    return res.status(200).json({ pools });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getRewardPoolController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const pool = await getRewardPoolById(paramId(req, 'id'));
    return res.status(200).json({ pool });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createRewardPoolController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createRewardPoolValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const pool = await createRewardPool(requesterId, parsed.data);
    return res.status(201).json({ pool });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateRewardPoolController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updateRewardPoolValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const pool = await updateRewardPool(
      requesterId,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ pool });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveRewardPoolController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archiveRewardPool(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreRewardPoolController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restoreRewardPool(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteRewardPoolController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteRewardPool(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Customer-or-staff (jwtMiddleware only - ownership resolved in the service
// layer, same shape as credits.routes.ts's GET /credits/balances)
// ---------------------------------------------------------------------------

export async function checkInController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await recordCheckIn(requesterId);
    return res.status(200).json({ result });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getPromoWheelController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const wheel = await getPromoWheel(paramId(req, 'promoId'));
    return res.status(200).json({ wheel });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getMySpinCreditsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const credits = await getMySpinCredits({
      requesterId,
      customerId: queryCustomerId(req),
    });
    return res.status(200).json({ credits });
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
      promoId: parsed.data.promo_id,
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
      customerId: queryCustomerId(req),
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
      customerId: queryCustomerId(req),
    });
    return res.status(200).json({ history });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
