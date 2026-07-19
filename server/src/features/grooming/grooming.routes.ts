import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  listGroomingQueueController,
  transitionGroomingStatusController,
} from './grooming.controller.ts';
import { GROOMING_QUEUE_ROLES } from './grooming.types.ts';

const router = Router();

router.get(
  '/grooming/queue',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...GROOMING_QUEUE_ROLES]),
  requireBranch,
  listGroomingQueueController
);

router.patch(
  '/grooming/sessions/:id/status',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...GROOMING_QUEUE_ROLES]),
  requireBranch,
  transitionGroomingStatusController
);

export default router;
