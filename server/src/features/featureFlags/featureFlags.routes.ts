import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  getFeatureFlagsController,
  updateFeatureFlagController,
} from './featureFlags.controller.ts';
import { FEATURE_FLAG_WRITE_ROLES } from './featureFlags.types.ts';

/**
 * Experimental feature switches (Settings > Experimental). Same two path
 * prefixes as landing.routes.ts:
 *
 * - `/public/feature-flags` - every shell reads it, signed in or not.
 * - `/maintenance/feature-flags/:key` - the Superadmin toggle.
 */
const router = Router();

const superadminOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...FEATURE_FLAG_WRITE_ROLES]),
];

router.get('/public/feature-flags', getFeatureFlagsController);
router.patch(
  '/maintenance/feature-flags/:key',
  superadminOnly,
  updateFeatureFlagController
);

export default router;
