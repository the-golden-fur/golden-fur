import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archiveBranchController,
  createBranchController,
  getBranchController,
  hardDeleteBranchController,
  listArchivedBranchesController,
  listBranchesController,
  restoreBranchController,
  updateBranchController,
} from './branches.controller.ts';
import { BRANCH_CONFIG_ROLES } from './branches.types.ts';

/**
 * Superadmin System Configuration - full branch read/write, distinct from
 * the lightweight `branches` SELECT-for-authenticated RLS every staff role
 * already reads directly via Supabase (maintenance.api.ts's listBranches,
 * used for branch-name dropdowns elsewhere). Read is also gated here
 * (Superadmin-only) since operating_hours/address/contact_number are config
 * details, not needed by that lighter dropdown use case.
 */
const router = Router();

const superadminOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BRANCH_CONFIG_ROLES]),
];

router.get('/branches', superadminOnly, listBranchesController);
// Must be registered before /branches/:id, or Express would match "archived"
// as an :id (same ordering promos.routes.ts's own archived-list route needs).
router.get(
  '/branches/archived',
  superadminOnly,
  listArchivedBranchesController
);
router.post('/branches', superadminOnly, createBranchController);
router.get('/branches/:id', superadminOnly, getBranchController);
router.patch('/branches/:id', superadminOnly, updateBranchController);
router.delete('/branches/:id', superadminOnly, archiveBranchController);
router.post('/branches/:id/restore', superadminOnly, restoreBranchController);
router.delete(
  '/branches/:id/permanent',
  superadminOnly,
  hardDeleteBranchController
);

export default router;
