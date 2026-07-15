import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  createDiscountController,
  getDiscountController,
  listDiscountsController,
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
router.post('/discounts', adminWrite, createDiscountController);
router.get('/discounts/:id', staffRead, getDiscountController);
router.patch('/discounts/:id', adminWrite, updateDiscountController);

export default router;
