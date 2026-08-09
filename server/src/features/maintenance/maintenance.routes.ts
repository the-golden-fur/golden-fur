import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archivePackageController,
  archivePromoController,
  createBreedController,
  createPackageController,
  createPromoController,
  createServiceController,
  createServiceTypeController,
  deleteBreedController,
  getPackageController,
  getPackagePricingConfigurationController,
  getPricingConfigurationController,
  getPromoController,
  getServiceController,
  hardDeletePackageController,
  hardDeletePromoController,
  listArchivedPackagesController,
  listArchivedPromosController,
  listBreedsController,
  listPackagesController,
  listPromoCapConfigurationsController,
  listPromosController,
  listServiceTypesController,
  listServicesController,
  restorePackageController,
  restorePromoController,
  setServiceBranchAvailabilityController,
  updateBreedController,
  updatePackageController,
  updatePackagePricingConfigurationController,
  updatePricingConfigurationController,
  updatePromoController,
  updateServiceController,
  updateServiceTypeController,
  upsertPromoCapConfigurationController,
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
router.get(
  '/maintenance/packages/archived',
  adminWrite,
  listArchivedPackagesController
);
router.post('/maintenance/packages', adminWrite, createPackageController);
router.get('/maintenance/packages/:id', staffRead, getPackageController);
router.patch('/maintenance/packages/:id', adminWrite, updatePackageController);
// Archive is the "delete" a normal admin performs (soft, reversible, still
// gated behind is_active === false via archivePackage's own guard).
router.delete(
  '/maintenance/packages/:id',
  adminWrite,
  archivePackageController
);
router.post(
  '/maintenance/packages/:id/restore',
  adminWrite,
  restorePackageController
);
router.delete(
  '/maintenance/packages/:id/permanent',
  adminWrite,
  hardDeletePackageController
);

// Promos (#42)
router.get('/maintenance/promos', staffRead, listPromosController);
router.get(
  '/maintenance/promos/archived',
  adminWrite,
  listArchivedPromosController
);
router.post('/maintenance/promos', adminWrite, createPromoController);
router.get('/maintenance/promos/:id', staffRead, getPromoController);
router.patch('/maintenance/promos/:id', adminWrite, updatePromoController);
router.delete('/maintenance/promos/:id', adminWrite, archivePromoController);
router.post(
  '/maintenance/promos/:id/restore',
  adminWrite,
  restorePromoController
);
router.delete(
  '/maintenance/promos/:id/permanent',
  adminWrite,
  hardDeletePromoController
);

// Pricing configuration (Epic B #80/#81)
router.get(
  '/maintenance/pricing-configuration',
  staffRead,
  getPricingConfigurationController
);
router.patch(
  '/maintenance/pricing-configuration',
  adminWrite,
  updatePricingConfigurationController
);

// Package pricing configuration (Epic B #82/#83)
router.get(
  '/maintenance/package-pricing-configuration',
  staffRead,
  getPackagePricingConfigurationController
);
router.patch(
  '/maintenance/package-pricing-configuration',
  adminWrite,
  updatePackagePricingConfigurationController
);

// Promo cap configuration (Epic B #84)
router.get(
  '/maintenance/promo-cap-configurations',
  staffRead,
  listPromoCapConfigurationsController
);
router.put(
  '/maintenance/promo-cap-configurations',
  adminWrite,
  upsertPromoCapConfigurationController
);

// Breeds (Epic A follow-up - previously seed-only, no CRUD anywhere)
router.get('/maintenance/breeds', staffRead, listBreedsController);
router.post('/maintenance/breeds', adminWrite, createBreedController);
router.patch('/maintenance/breeds/:id', adminWrite, updateBreedController);
router.delete('/maintenance/breeds/:id', adminWrite, deleteBreedController);

// Service Types (Custom change)
router.get('/maintenance/service-types', staffRead, listServiceTypesController);
router.post(
  '/maintenance/service-types',
  adminWrite,
  createServiceTypeController
);
router.patch(
  '/maintenance/service-types/:id',
  adminWrite,
  updateServiceTypeController
);

export default router;
