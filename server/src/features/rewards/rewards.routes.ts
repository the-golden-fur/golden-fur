import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archiveSpinWheelRewardController,
  createSpinWheelRewardController,
  getMySpinCreditsController,
  getSpinWheelConfigController,
  hardDeleteSpinWheelRewardController,
  listArchivedSpinWheelRewardsController,
  listMyCouponsController,
  listMySpinHistoryController,
  listSpinWheelRewardsController,
  restoreSpinWheelRewardController,
  spinController,
  updateSpinWheelConfigController,
  updateSpinWheelRewardController,
} from './rewards.controller.ts';
import { REWARDS_READ_ROLES, REWARDS_WRITE_ROLES } from './rewards.types.ts';

const router = Router();

const staffRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...REWARDS_READ_ROLES]),
];

const adminWrite = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...REWARDS_WRITE_ROLES]),
];

// Spin wheel config + reward catalog admin (session 86)
router.get(
  '/rewards/spin-wheel/config',
  staffRead,
  getSpinWheelConfigController
);
router.put(
  '/rewards/spin-wheel/config',
  adminWrite,
  updateSpinWheelConfigController
);

// Reward listing is open to any authenticated principal (jwtMiddleware
// only) - the customer-facing wheel UI needs to render every active reward
// as a segment before/while spinning, same reasoning as the
// spin_wheel_rewards RLS policy in 20260913196.
router.get(
  '/rewards/spin-wheel/rewards',
  jwtMiddleware,
  listSpinWheelRewardsController
);
router.get(
  '/rewards/spin-wheel/rewards/archived',
  adminWrite,
  listArchivedSpinWheelRewardsController
);
router.post(
  '/rewards/spin-wheel/rewards',
  adminWrite,
  createSpinWheelRewardController
);
router.patch(
  '/rewards/spin-wheel/rewards/:id',
  adminWrite,
  updateSpinWheelRewardController
);
router.delete(
  '/rewards/spin-wheel/rewards/:id',
  adminWrite,
  archiveSpinWheelRewardController
);
router.post(
  '/rewards/spin-wheel/rewards/:id/restore',
  adminWrite,
  restoreSpinWheelRewardController
);
router.delete(
  '/rewards/spin-wheel/rewards/:id/permanent',
  adminWrite,
  hardDeleteSpinWheelRewardController
);

// Customer-or-staff (jwtMiddleware only - ownership resolved in the
// service layer, same shape as credits.routes.ts's GET /credits/balances -
// a receptionist triggering a walk-in's earned spin passes customer_id).
router.get(
  '/rewards/my-spin-credits',
  jwtMiddleware,
  getMySpinCreditsController
);
router.post('/rewards/spin', jwtMiddleware, spinController);
router.get('/rewards/my-coupons', jwtMiddleware, listMyCouponsController);
router.get(
  '/rewards/my-spin-history',
  jwtMiddleware,
  listMySpinHistoryController
);

export default router;
