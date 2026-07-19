import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  checkInDaycareSessionController,
  checkOutDaycareSessionController,
} from './daycare.controller.ts';
import { DAYCARE_ROLES } from './daycare.types.ts';

const router = Router();

router.post(
  '/daycare/check-in',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_ROLES]),
  requireBranch,
  checkInDaycareSessionController
);

router.post(
  '/daycare/sessions/:id/checkout',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_ROLES]),
  requireBranch,
  checkOutDaycareSessionController
);

export default router;
