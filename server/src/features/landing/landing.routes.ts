import { Router } from 'express';
import multer from 'multer';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  createLandingReviewController,
  deleteLandingReviewController,
  getLandingAdminController,
  getPublicLandingController,
  handleLandingImageUploadError,
  listPublicBranchesController,
  resetLandingImageController,
  updateLandingContentController,
  updateLandingReviewController,
  updateLandingSectionController,
  uploadLandingImageController,
} from './landing.controller.ts';
import { LANDING_WRITE_ROLES } from './landing.types.ts';

/**
 * The editable landing page. Two audiences, so two existing path prefixes
 * (both already forwarded by client/vite.proxy.config.ts), same as
 * faq.routes.ts:
 *
 * - `/public/landing`, `/public/branches` - what the landing page reads. No
 *   auth at all: it is shown to visitors who haven't logged in.
 * - `/maintenance/landing/...` - the Superadmin settings screen that edits it.
 */
const router = Router();

const superadminOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...LANDING_WRITE_ROLES]),
];

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/public/landing', getPublicLandingController);
router.get('/public/branches', listPublicBranchesController);

router.get('/maintenance/landing', superadminOnly, getLandingAdminController);
router.patch(
  '/maintenance/landing/content',
  superadminOnly,
  updateLandingContentController
);
router.patch(
  '/maintenance/landing/sections/:key',
  superadminOnly,
  updateLandingSectionController
);
router.post(
  '/maintenance/landing/reviews',
  superadminOnly,
  createLandingReviewController
);
router.patch(
  '/maintenance/landing/reviews/:id',
  superadminOnly,
  updateLandingReviewController
);
router.delete(
  '/maintenance/landing/reviews/:id',
  superadminOnly,
  deleteLandingReviewController
);
router.post(
  '/maintenance/landing/images/:key',
  superadminOnly,
  imageUpload.single('image'),
  handleLandingImageUploadError,
  uploadLandingImageController
);
router.delete(
  '/maintenance/landing/images/:key',
  superadminOnly,
  resetLandingImageController
);

export default router;
