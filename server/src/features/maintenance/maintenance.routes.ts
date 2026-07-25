import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  createBreedController,
  createPackageController,
  createPromoController,
  createServiceController,
  deleteBreedController,
  getPackageController,
  getPromoController,
  getServiceController,
  listBreedsController,
  listPackagesController,
  listPromosController,
  listServicesController,
  setServiceBranchAvailabilityController,
  updateBreedController,
  updatePackageController,
  updatePromoController,
  updateServiceController,
} from './maintenance.controller.ts';
import {
  MAINTENANCE_READ_ROLES,
  MAINTENANCE_WRITE_ROLES,
} from './maintenance.types.ts';

/**
 * Unlike staff routes, maintenance configuration is not branch-scoped for
 * access (an Admin manages both branches' catalog from one panel), so
 * requireBranch is deliberately omitted; branch filtering is a query
 * parameter, and per-branch availability is data, not authorization.
 */
const router = Router();

const staffRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...MAINTENANCE_READ_ROLES]),
];

const adminWrite = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...MAINTENANCE_WRITE_ROLES]),
];

// Services (#40)
router.get('/maintenance/services', staffRead, listServicesController);
router.post('/maintenance/services', adminWrite, createServiceController);
router.get('/maintenance/services/:id', staffRead, getServiceController);
router.patch('/maintenance/services/:id', adminWrite, updateServiceController);
router.patch(
  '/maintenance/services/:id/branch-availability',
  adminWrite,
  setServiceBranchAvailabilityController
);

// Packages (#41)
router.get('/maintenance/packages', staffRead, listPackagesController);
router.post('/maintenance/packages', adminWrite, createPackageController);
router.get('/maintenance/packages/:id', staffRead, getPackageController);
router.patch('/maintenance/packages/:id', adminWrite, updatePackageController);

// Promos (#42)
router.get('/maintenance/promos', staffRead, listPromosController);
router.post('/maintenance/promos', adminWrite, createPromoController);
router.get('/maintenance/promos/:id', staffRead, getPromoController);
router.patch('/maintenance/promos/:id', adminWrite, updatePromoController);

// Breeds (Epic A follow-up - previously seed-only, no CRUD anywhere)
router.get('/maintenance/breeds', staffRead, listBreedsController);
router.post('/maintenance/breeds', adminWrite, createBreedController);
router.patch('/maintenance/breeds/:id', adminWrite, updateBreedController);
router.delete('/maintenance/breeds/:id', adminWrite, deleteBreedController);

export default router;
