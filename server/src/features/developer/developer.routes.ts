import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { BUG_REPORT_MANAGER_ROLES } from '../bugReports/bugReports.types.ts';
import { developerStatsController } from './developer.controller.ts';

/** The Developer Dashboard - user/account counts. Developer/Superadmin
 * only, no requireBranch - cross-branch, same as Analytics
 * (reports.routes.ts's analyticsRead). */
const router = Router();

const developerDashboardAccess = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BUG_REPORT_MANAGER_ROLES]),
];

router.get(
  '/developer/stats',
  developerDashboardAccess,
  developerStatsController
);

export default router;
