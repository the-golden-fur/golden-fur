import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  checkInDaycareSessionController,
  checkOutDaycareSessionController,
  listDaycareSessionsController,
  previewDaycareCheckoutController,
} from './daycare.controller.ts';
import { DAYCARE_ADVANCE_ROLES } from './daycare.types.ts';

const router = Router();

router.post(
  '/daycare/check-in',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_ADVANCE_ROLES]),
  requireBranch,
  checkInDaycareSessionController
);

router.get(
  '/daycare/sessions',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_ADVANCE_ROLES]),
  requireBranch,
  listDaycareSessionsController
);

router.post(
  '/daycare/sessions/:id/checkout',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_ADVANCE_ROLES]),
  requireBranch,
  checkOutDaycareSessionController
);

router.get(
  '/daycare/sessions/:id/checkout-preview',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_ADVANCE_ROLES]),
  requireBranch,
  previewDaycareCheckoutController
);

export default router;
