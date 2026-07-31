import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  createProductController,
  deleteProductController,
  listProductsController,
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
router.post('/catalog/products', adminWrite, createProductController);
router.patch('/catalog/products/:id', adminWrite, updateProductController);
router.delete('/catalog/products/:id', adminWrite, deleteProductController);

export default router;
