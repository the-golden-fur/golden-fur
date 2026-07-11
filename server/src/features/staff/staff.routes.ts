import { Router } from 'express';
import multer from 'multer';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  cancelUnavailabilityBlockController,
  createUnavailabilityBlockController,
  handleAvatarUploadError,
  listStaffController,
  listUnavailabilityBlocksController,
  getStaffProfileController,
  updateStaffProfileController,
  uploadAvatarController,
} from './staff.controller.ts';
import { ALL_STAFF_ROLES } from './staff.types.ts';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

router.post(
  '/staff/:id/avatar',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  avatarUpload.single('avatar'),
  handleAvatarUploadError,
  uploadAvatarController
);

router.post(
  '/staff/:id/unavailability',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  createUnavailabilityBlockController
);

router.get(
  '/staff/:id/unavailability',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  listUnavailabilityBlocksController
);

router.delete(
  '/staff/:id/unavailability/:blockId',
  jwtMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  cancelUnavailabilityBlockController
);

export default router;
