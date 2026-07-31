import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archiveDiscountController,
  createDiscountController,
  getDiscountController,
  hardDeleteDiscountController,
  listArchivedDiscountsController,
  listDiscountsController,
  restoreDiscountController,
  updateDiscountController,
} from './discounts.controller.ts';
import {
  DISCOUNT_READ_ROLES,
  DISCOUNT_WRITE_ROLES,
} from './discounts.types.ts';

/**
 * Same access shape as maintenance.routes.ts: all-staff read, Admin/
 * Superadmin write, no requireBranch (discount configuration spans both
 * branches; branch is a data field/query filter, not an authorization gate).
 */
const router = Router();

const staffRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DISCOUNT_READ_ROLES]),
];

const adminWrite = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...DISCOUNT_WRITE_ROLES]),
];

router.get('/discounts', staffRead, listDiscountsController);
router.get('/discounts/archived', adminWrite, listArchivedDiscountsController);
router.post('/discounts', adminWrite, createDiscountController);
router.get('/discounts/:id', staffRead, getDiscountController);
router.patch('/discounts/:id', adminWrite, updateDiscountController);
// Archive is the "delete" a normal admin performs (soft, reversible, still
// gated behind is_active === false via archiveDiscount's own guard).
router.delete('/discounts/:id', adminWrite, archiveDiscountController);
router.post('/discounts/:id/restore', adminWrite, restoreDiscountController);
router.delete(
  '/discounts/:id/permanent',
  adminWrite,
  hardDeleteDiscountController
);

export default router;
