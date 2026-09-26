import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archiveRewardPoolController,
  archiveSpinWheelRewardController,
  checkInController,
  createRewardPoolController,
  createSpinWheelRewardController,
  getMySpinCreditsController,
  getPromoWheelController,
  getRewardPoolController,
  hardDeleteRewardPoolController,
  hardDeleteSpinWheelRewardController,
  listArchivedRewardPoolsController,
  listArchivedSpinWheelRewardsController,
  listMyCouponsController,
  listMySpinHistoryController,
  listRewardPoolsController,
  listSpinWheelRewardsController,
  restoreRewardPoolController,
  restoreSpinWheelRewardController,
  spinController,
  updateRewardPoolController,
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

// Reward catalog admin (session 86, tier/weight since session 114). Staff
// read only - customers get a promo's rewards (with computed chances)
// through GET /rewards/spin-wheel/promos/:promoId/wheel instead.
router.get(
  '/rewards/spin-wheel/rewards',
  staffRead,
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

// Reward pools admin (session 114). /archived is registered before /:id so
// it isn't swallowed as an id.
router.get('/rewards/reward-pools', staffRead, listRewardPoolsController);
router.get(
  '/rewards/reward-pools/archived',
  adminWrite,
  listArchivedRewardPoolsController
);
router.get('/rewards/reward-pools/:id', staffRead, getRewardPoolController);
router.post('/rewards/reward-pools', adminWrite, createRewardPoolController);
router.patch(
  '/rewards/reward-pools/:id',
  adminWrite,
  updateRewardPoolController
);
router.delete(
  '/rewards/reward-pools/:id',
  adminWrite,
  archiveRewardPoolController
);
router.post(
  '/rewards/reward-pools/:id/restore',
  adminWrite,
  restoreRewardPoolController
);
router.delete(
  '/rewards/reward-pools/:id/permanent',
  adminWrite,
  hardDeleteRewardPoolController
);

// Customer-or-staff (jwtMiddleware only - ownership resolved in the
// service layer, same shape as credits.routes.ts's GET /credits/balances -
// a receptionist triggering a walk-in's earned spin passes customer_id).
router.post('/rewards/check-in', jwtMiddleware, checkInController);
router.get(
  '/rewards/spin-wheel/promos/:promoId/wheel',
  jwtMiddleware,
  getPromoWheelController
);
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
