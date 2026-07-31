import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  checkoutController,
  createMiscSaleController,
  deleteMiscSaleController,
  getMiscSaleController,
  listMiscSalesController,
  paymongoFeeRateController,
  previewCheckoutController,
  updateMiscSaleController,
} from './billing.controller.ts';
import { BILLING_ADMIN_ROLES, BILLING_STAFF_ROLES } from './billing.types.ts';

const router = Router();

const staffAccess = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BILLING_STAFF_ROLES]),
];

const adminOnly = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BILLING_ADMIN_ROLES]),
];

// Issue #83: PayMongo fee rate, surfaced to the frontend for the inline
// service-fee notice (#86) - staff-only, not customer-facing, since the
// customer sees PayMongo's own notice at their hosted checkout page.
router.get(
  '/billing/paymongo/fee-rate',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  paymongoFeeRateController
);

// Issue #84
router.get(
  '/billing/checkout/:bookingId/preview',
  ...staffAccess,
  previewCheckoutController
);

router.post(
  '/billing/checkout',
  ...staffAccess,
  requireBranch,
  checkoutController
);

// Issue #85: full CRUD, per explicit request. Create is open to every
// money-handling role (BILLING_STAFF_ROLES); update/delete are Admin/
// Superadmin only (BILLING_ADMIN_ROLES), mirrored by the RLS policies on
// transactions/transaction_line_items (migration 20260731068/069).
router.post(
  '/billing/misc-sale',
  ...staffAccess,
  requireBranch,
  createMiscSaleController
);

router.get('/billing/misc-sale', ...staffAccess, listMiscSalesController);
router.get('/billing/misc-sale/:id', ...staffAccess, getMiscSaleController);
router.patch('/billing/misc-sale/:id', ...adminOnly, updateMiscSaleController);
router.delete('/billing/misc-sale/:id', ...adminOnly, deleteMiscSaleController);

export default router;
