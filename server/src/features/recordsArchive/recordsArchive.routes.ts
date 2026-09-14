import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { ADMIN_ROLES } from '../staff/staff.types.ts';
import {
  listDeletedRecordTablesController,
  listDeletedRecordsController,
  purgeDeletedRecordController,
  restoreDeletedRecordController,
} from './recordsArchive.controller.ts';

const router = Router();

// Mounted under /staff (not a new API_ROUTE_PREFIXES entry) - this is
// staff/admin tooling, same as the rest of the Archive page's own routes.
const adminOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...ADMIN_ROLES]),
];

router.get('/staff/deleted-records', adminOnly, listDeletedRecordsController);
router.get(
  '/staff/deleted-records/tables',
  adminOnly,
  listDeletedRecordTablesController
);
router.post(
  '/staff/deleted-records/:id/restore',
  adminOnly,
  restoreDeletedRecordController
);
router.delete(
  '/staff/deleted-records/:id',
  adminOnly,
  purgeDeletedRecordController
);

export default router;
