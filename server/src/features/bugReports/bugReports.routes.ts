import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  createBugReportController,
  listBugReportsController,
  updateBugReportStatusController,
} from './bugReports.controller.ts';
import { BUG_REPORT_MANAGER_ROLES } from './bugReports.types.ts';

/**
 * The mascot widget's "Report a bug / feature request" option, for both
 * customer and staff accounts, plus the Developer/Superadmin queue that
 * reviews submissions.
 */
const router = Router();

// Open to any authenticated customer or staff member - no role gate, exact
// mirror of reports.routes.ts's /reports/my-transaction-history
// (myTransactionHistoryRead). The controller resolves the reporter from the
// JWT, scoped server-side to the caller's own id either way.
router.post(
  '/bug-reports',
  [jwtMiddleware, sessionTimeoutMiddleware],
  createBugReportController
);

const bugReportManagerAccess = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BUG_REPORT_MANAGER_ROLES]),
];

router.get('/bug-reports', bugReportManagerAccess, listBugReportsController);
router.patch(
  '/bug-reports/:id/status',
  bugReportManagerAccess,
  updateBugReportStatusController
);

export default router;
