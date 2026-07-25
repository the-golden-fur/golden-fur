import { Router } from 'express';
import multer from 'multer';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  cancelUnavailabilityBlockController,
  createStaffAccountController,
  createUnavailabilityBlockController,
  handleAvatarUploadError,
  listPendingUnavailabilityBlocksController,
  listStaffController,
  listUnavailabilityBlocksController,
  getStaffProfileController,
  manageStaffAccountController,
  resendAccountEmailController,
  reviewUnavailabilityBlockController,
  updateStaffProfileController,
  uploadAvatarController,
} from './staff.controller.ts';
import {
  ADMIN_ROLES,
  ALL_STAFF_ROLES,
  UNAVAILABILITY_MANAGER_ROLES,
} from './staff.types.ts';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get(
  '/staff',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  listStaffController
);

router.post(
  '/staff',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ADMIN_ROLES]),
  requireBranch,
  createStaffAccountController
);

router.get(
  '/staff/unavailability/pending',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...UNAVAILABILITY_MANAGER_ROLES]),
  requireBranch,
  listPendingUnavailabilityBlocksController
);

router.get(
  '/staff/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  getStaffProfileController
);

router.patch(
  '/staff/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  updateStaffProfileController
);

router.patch(
  '/staff/:id/manage',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ADMIN_ROLES]),
  requireBranch,
  manageStaffAccountController
);

router.post(
  '/staff/:id/resend-account-email',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ADMIN_ROLES]),
  requireBranch,
  resendAccountEmailController
);

router.post(
  '/staff/:id/avatar',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  avatarUpload.single('avatar'),
  handleAvatarUploadError,
  uploadAvatarController
);

router.post(
  '/staff/:id/unavailability',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  createUnavailabilityBlockController
);

router.get(
  '/staff/:id/unavailability',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  listUnavailabilityBlocksController
);

router.delete(
  '/staff/:id/unavailability/:blockId',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ALL_STAFF_ROLES]),
  requireBranch,
  cancelUnavailabilityBlockController
);

router.patch(
  '/staff/:id/unavailability/:blockId/review',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...UNAVAILABILITY_MANAGER_ROLES]),
  requireBranch,
  reviewUnavailabilityBlockController
);

export default router;
