import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  listStaffController,
  getStaffProfileController,
  updateStaffProfileController,
} from './staff.controller.ts';
import { ALL_STAFF_ROLES } from './staff.types.ts';

const router = Router();

router.get(
  '/staff',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  listStaffController
);

router.get(
  '/staff/:id',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  getStaffProfileController
);

router.patch(
  '/staff/:id',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  updateStaffProfileController
);

export default router;
