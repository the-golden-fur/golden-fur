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
import {
  DAYCARE_ADVANCE_ROLES,
  DAYCARE_FRONT_DESK_ROLES,
} from './daycare.types.ts';

const router = Router();

// Custom change (Groomer/Pet Assistant check-in restriction): narrowed from
// DAYCARE_ADVANCE_ROLES to DAYCARE_FRONT_DESK_ROLES - Groomer/Pet Assistant
// keep queue visibility and care-log-entry status marking (still
// DAYCARE_ADVANCE_ROLES below) but no longer check pets in/out.
router.post(
  '/daycare/check-in',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_FRONT_DESK_ROLES]),
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
  requireRole([...DAYCARE_FRONT_DESK_ROLES]),
  requireBranch,
  checkOutDaycareSessionController
);

router.get(
  '/daycare/sessions/:id/checkout-preview',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DAYCARE_FRONT_DESK_ROLES]),
  requireBranch,
  previewDaycareCheckoutController
);

export default router;
