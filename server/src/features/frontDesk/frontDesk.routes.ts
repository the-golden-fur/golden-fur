import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  completeFrontDeskBookingController,
  listFrontDeskQueueController,
  startFrontDeskBookingController,
} from './frontDesk.controller.ts';
import { FRONT_DESK_QUEUE_ROLES } from './frontDesk.types.ts';

const router = Router();

const frontDeskOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...FRONT_DESK_QUEUE_ROLES]),
  requireBranch,
];

router.get('/front-desk/queue', frontDeskOnly, listFrontDeskQueueController);

router.post(
  '/front-desk/bookings/:id/start',
  frontDeskOnly,
  startFrontDeskBookingController
);

router.post(
  '/front-desk/bookings/:id/complete',
  frontDeskOnly,
  completeFrontDeskBookingController
);

export default router;
