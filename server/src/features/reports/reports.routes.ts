import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  analyticsSummaryController,
  cageOccupancyReportController,
  customerTransactionHistoryController,
  dailySalesReportController,
  transactionHistoryController,
} from './reports.controller.ts';
import {
  ANALYTICS_READ_ROLES,
  REPORTS_READ_ROLES,
  TRANSACTION_HISTORY_READ_ROLES,
} from './reports.types.ts';

/**
 * Issues #102/#103: staff-only, all four routes - Admin/Supervisor/
 * Superadmin for the DSR/cage-occupancy reads (Cashier added for
 * transaction-history only - TRANSACTION_HISTORY_READ_ROLES), Superadmin-only
 * for analytics (Modules-Features is explicit on that split). requireBranch
 * resolves req.user.branch_id, which every service needs even for a
 * Superadmin caller (as the "own branch" fallback whenever they don't pass
 * an explicit branch_id).
 *
 * Custom change (P-1 roadmap item: transaction history visibility) - a
 * separate customer-facing route (GET /reports/my-transaction-history) is
 * added below, open to any authenticated caller (no staff role/branch at
 * all - a customer JWT has neither) and always scoped to the caller's own
 * customer_id server-side, mirroring how booking creation is open to
 * customers without a staff role.
 */
const router = Router();

const reportsRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...REPORTS_READ_ROLES]),
  requireBranch,
];

const transactionHistoryRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...TRANSACTION_HISTORY_READ_ROLES]),
  requireBranch,
];

const myTransactionHistoryRead = [jwtMiddleware, sessionTimeoutMiddleware];

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
  transactionHistoryRead,
  transactionHistoryController
);
router.get(
  '/reports/my-transaction-history',
  myTransactionHistoryRead,
  customerTransactionHistoryController
);
router.get('/reports/analytics', analyticsRead, analyticsSummaryController);

export default router;
