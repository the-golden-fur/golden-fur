import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archiveCustomerCatalogItemController,
  archiveProductController,
  createCustomerCatalogItemController,
  createProductController,
  hardDeleteProductController,
  listArchivedProductsController,
  listCustomerCatalogController,
  listCustomerCatalogForStaffController,
  listProductsController,
  restoreProductController,
  updateCustomerCatalogItemController,
  updateProductController,
} from './catalog.controller.ts';
import { CATALOG_READ_ROLES, CATALOG_WRITE_ROLES } from './catalog.types.ts';

/**
 * Replaces hotel.routes.ts's /hotel/food-catalog and /hotel/medication-
 * catalog endpoints (Sprint 5 unification). Not branch-scoped, same
 * rationale as the tables it replaces - requireBranch is deliberately
 * omitted.
 */
const router = Router();

const staffRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...CATALOG_READ_ROLES]),
];

const adminWrite = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...CATALOG_WRITE_ROLES]),
];

router.get('/catalog/products', staffRead, listProductsController);
router.get(
  '/catalog/products/archived',
  adminWrite,
  listArchivedProductsController
);
router.post('/catalog/products', adminWrite, createProductController);
router.patch('/catalog/products/:id', adminWrite, updateProductController);
// Archive is the "delete" a normal admin performs (soft, reversible, still
// gated behind is_active === false via archiveProduct's own guard).
router.delete('/catalog/products/:id', adminWrite, archiveProductController);
router.post(
  '/catalog/products/:id/restore',
  adminWrite,
  restoreProductController
);
router.delete(
  '/catalog/products/:id/permanent',
  adminWrite,
  hardDeleteProductController
);

// #22: a customer's own food/medication types for future hotel bookings -
// no role gate (any authenticated customer), scoped server-side to their
// own owner_customer_id (see customerProductCatalog.service.ts). Reachable
// both from the hotel booking wizard and standalone, outside the booking
// queue, per the feature request.
const customerAuth = [jwtMiddleware, sessionTimeoutMiddleware];

router.get(
  '/customers/me/food-medication-catalog',
  customerAuth,
  listCustomerCatalogController
);
// Staff-facing: a receptionist booking/checking in on behalf of a customer
// needs that customer's own saved types, not their own - same read audience
// as /catalog/products (staffRead), just scoped to one customer instead of
// the global catalog.
router.get(
  '/customers/:customerId/food-medication-catalog',
  staffRead,
  listCustomerCatalogForStaffController
);
router.post(
  '/customers/me/food-medication-catalog',
  customerAuth,
  createCustomerCatalogItemController
);
router.patch(
  '/customers/me/food-medication-catalog/:id',
  customerAuth,
  updateCustomerCatalogItemController
);
router.delete(
  '/customers/me/food-medication-catalog/:id',
  customerAuth,
  archiveCustomerCatalogItemController
);

export default router;
