import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  listCreditBalancesController,
  listCreditHistoryController,
  runCreditExpiryController,
} from './credits.controller.ts';
import { CREDIT_ADMIN_ROLES } from './credits.types.ts';

const router = Router();

// Issue #95: customer-or-staff, same jwtMiddleware-only shape as bookings'
// own GET /bookings - ownership/role authorization happens in
// creditBalance.service.ts, not at the route level.
router.get('/credits/balances', jwtMiddleware, listCreditBalancesController);
router.get('/credits/history', jwtMiddleware, listCreditHistoryController);

// Issue #93: Admin/Superadmin-only manual expiry trigger - the primary
// mechanism (not just a verification aid) in any environment without
// pg_cron.
router.post(
  '/credits/expire',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...CREDIT_ADMIN_ROLES]),
  runCreditExpiryController
);

export default router;
