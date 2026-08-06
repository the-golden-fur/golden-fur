import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  analyticsSummaryController,
  cageOccupancyReportController,
  dailySalesReportController,
  transactionHistoryController,
} from './reports.controller.ts';
import { ANALYTICS_READ_ROLES, REPORTS_READ_ROLES } from './reports.types.ts';

/**
 * Issues #102/#103: staff-only, all four routes - Admin/Supervisor/
 * Superadmin for the DSR/cage-occupancy/transaction-history reads,
 * Superadmin-only for analytics (Modules-Features is explicit on that
 * split). requireBranch resolves req.user.branch_id, which every service
 * needs even for a Superadmin caller (as the "own branch" fallback whenever
 * they don't pass an explicit branch_id).
 */
const router = Router();

const reportsRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...REPORTS_READ_ROLES]),
  requireBranch,
];

const analyticsRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ANALYTICS_READ_ROLES]),
];

router.get('/reports/dsr', reportsRead, dailySalesReportController);
router.get(
  '/reports/cage-occupancy',
  reportsRead,
  cageOccupancyReportController
);
router.get(
  '/reports/transaction-history',
  reportsRead,
  transactionHistoryController
);
router.get('/reports/analytics', analyticsRead, analyticsSummaryController);

export default router;
