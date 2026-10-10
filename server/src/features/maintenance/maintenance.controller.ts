import type { NextFunction, Response } from 'express';
import multer from 'multer';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  archiveService,
  createService,
  getServiceById,
  hardDeleteService,
  listServices,
  restoreService,
  setServiceBranchAvailability,
  setServiceBranchPrice,
  updateService,
} from './services/services.service.ts';
import { uploadServiceImage } from './services/maintenanceImageUpload.service.ts';
import {
  setPackagePricingCells,
  setServicePricingCells,
} from './services/pricingCells.service.ts';
import {
  archivePackage,
  createPackage,
  getPackageById,
  hardDeletePackage,
  listArchivedPackages,
  listPackages,
  restorePackage,
  setPackageBranchAvailability,
  updatePackage,
} from './services/packages.service.ts';
import {
  archivePromo,
  createPromo,
  getPromoById,
  hardDeletePromo,
  listArchivedPromos,
  listPromos,
  restorePromo,
  setPromoBranchAvailability,
  updatePromo,
} from './services/promos.service.ts';
import {
  createBreed,
  archiveBreed,
  hardDeleteBreed,
  listArchivedBreeds,
  restoreBreed,
  listBreeds,
  updateBreed,
} from './services/breeds.service.ts';
import {
  getPricingConfiguration,
  updatePricingConfiguration,
} from './services/pricingConfiguration.service.ts';
import {
  getPackagePricingConfiguration,
  updatePackagePricingConfiguration,
} from './services/packagePricing.service.ts';
import {
  getPetWeightClassConfiguration,
  updatePetWeightClassConfiguration,
} from './services/petWeightClassConfiguration.service.ts';
import {
  listPromoCapConfigurations,
  upsertPromoCapConfiguration,
} from './services/promoCap.service.ts';
import {
  archiveServiceType,
  createServiceType,
  hardDeleteServiceType,
  listArchivedServiceTypes,
  listServiceTypes,
  restoreServiceType,
  setServiceTypeBranchAvailability,
  updateServiceType,
} from './services/serviceTypes.service.ts';
import {
  branchAvailabilityValidator,
  branchPriceValidator,
  pricingCellsValidator,
  createBreedValidator,
  createPackageValidator,
  createPromoValidator,
  createServiceTypeValidator,
  createServiceValidator,
  updateBreedValidator,
  updatePackagePricingConfigurationValidator,
  updatePackageValidator,
  updatePetWeightClassConfigurationValidator,
  updatePricingConfigurationValidator,
  updatePromoValidator,
  updateServiceTypeValidator,
  updateServiceValidator,
  upsertPromoCapConfigurationValidator,
  createPetTypeValidator,
  updatePetTypeValidator,
  upsertPetTypePriceOverrideValidator,
} from './modules/validators/maintenance.validator.ts';
import {
  archivePetType,
  createPetType,
  hardDeletePetType,
  listArchivedPetTypes,
  listPetTypes,
  restorePetType,
  updatePetType,
} from './services/petTypes.service.ts';
import {
  deletePetTypePriceOverride,
  listPetTypePriceOverrides,
  upsertPetTypePriceOverride,
} from './services/petTypePriceOverrides.service.ts';

/**
 * Role gating (all-staff read, Admin/Superadmin write) happens at the route
 * level via requireRole - see maintenance.routes.ts - so controllers only
 * validate payloads and map thrown service `statusCode` errors, mirroring
 * staff.controller.ts.
 */

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

// ---------------------------------------------------------------------------
// Service/service type/package image upload (Architectural-Change-History)
// ---------------------------------------------------------------------------

/** Mirrors staff.controller.ts's handleAvatarUploadError - translates a
 * multer failure (e.g. the 5MB limit) into the same JSON error shape every
 * other maintenance endpoint returns, instead of Express's default HTML
 * error page. */
export function handleServiceImageUploadError(
  err: unknown,
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }

  return next();
}

export async function uploadServiceImageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const file = req.file as
    | {
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
      }
    | undefined;

  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const imageUrl = await uploadServiceImage({ file });
    return res.status(201).json({ image_url: imageUrl });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Services (#40)
// ---------------------------------------------------------------------------

export async function listServicesController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const services = await listServices({
      category: queryString(req.query.category),
      branchId: queryString(req.query.branch_id),
      includeInactive: req.query.include_inactive === 'true',
    });

    return res.status(200).json({ services });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getServiceController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const service = await getServiceById(paramId(req, 'id'));
    return res.status(200).json({ service });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createServiceController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createServiceValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const service = await createService({
      requesterId,
      requesterRole: req.user?.role,
      input: parsed.data,
    });
    return res.status(201).json({ service });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateServiceController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updateServiceValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const service = await updateService({
      requesterId,
      requesterRole: req.user?.role,
      serviceId: paramId(req, 'id'),
      updates: parsed.data,
    });

    return res.status(200).json({ service });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function setServiceBranchAvailabilityController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterId || !requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = branchAvailabilityValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const availability = await setServiceBranchAvailability({
      serviceId: paramId(req, 'id'),
      branchId: parsed.data.branch_id,
      isAvailable: parsed.data.is_available,
      requesterRole,
      requesterBranchId,
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** A branch's own price for a service - Superadmin-only (route + service). */
export async function setServiceBranchPriceController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;

  if (!req.user?.sub || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = branchPriceValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const availability = await setServiceBranchPrice({
      serviceId: paramId(req, 'id'),
      branchId: parsed.data.branch_id,
      priceOverride: parsed.data.price_override,
      requesterRole,
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** Per-item weight x coat pricing - shared by the service and package
 * routes below. Superadmin-only (route + service). */
async function handlePricingCells(
  req: AuthenticatedRequest,
  res: Response,
  kind: 'service' | 'package'
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = pricingCellsValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const params = { cells: parsed.data.cells, requesterId, requesterRole };

  try {
    if (kind === 'service') {
      const service = await setServicePricingCells(paramId(req, 'id'), params);
      return res.status(200).json({ service });
    }

    const pkg = await setPackagePricingCells(paramId(req, 'id'), params);
    return res.status(200).json({ package: pkg });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export function setServicePricingCellsController(
  req: AuthenticatedRequest,
  res: Response
) {
  return handlePricingCells(req, res, 'service');
}

export function setPackagePricingCellsController(
  req: AuthenticatedRequest,
  res: Response
) {
  return handlePricingCells(req, res, 'package');
}

// ---------------------------------------------------------------------------
// Packages (#41)
// ---------------------------------------------------------------------------

export async function listPackagesController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const packages = await listPackages({
      branchId: queryString(req.query.branch_id),
      includeInactive: req.query.include_inactive === 'true',
    });

    return res.status(200).json({ packages });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getPackageController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const pkg = await getPackageById(paramId(req, 'id'));
    return res.status(200).json({ package: pkg });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createPackageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createPackageValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const pkg = await createPackage({
      requesterId,
      requesterRole: req.user?.role,
      input: parsed.data,
    });
    return res.status(201).json({ package: pkg });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePackageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updatePackageValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const pkg = await updatePackage({
      requesterId,
      requesterRole: req.user?.role,
      packageId: paramId(req, 'id'),
      updates: parsed.data,
    });

    return res.status(200).json({ package: pkg });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function setPackageBranchAvailabilityController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterId || !requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = branchAvailabilityValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const availability = await setPackageBranchAvailability({
      packageId: paramId(req, 'id'),
      branchId: parsed.data.branch_id,
      isAvailable: parsed.data.is_available,
      requesterRole,
      requesterBranchId,
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archivePackageController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archivePackage(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restorePackageController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restorePackage(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedPackagesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const packages = await listArchivedPackages();
    return res.status(200).json({ packages });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeletePackageController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeletePackage(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Promos (#42)
// ---------------------------------------------------------------------------

export async function listPromosController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const promos = await listPromos({
      branchId: queryString(req.query.branch_id),
      includeInactive: req.query.include_inactive === 'true',
      // Session 114: only the admin Promos tab asks for spin-wheel promos;
      // every other caller wants discount promos only.
      includeSpinWheel: req.query.include_spin_wheel === 'true',
    });

    return res.status(200).json({ promos });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getPromoController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const promo = await getPromoById(paramId(req, 'id'));
    return res.status(200).json({ promo });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createPromoController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createPromoValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const promo = await createPromo({ requesterId, input: parsed.data });
    return res.status(201).json({ promo });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePromoController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updatePromoValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const promo = await updatePromo({
      requesterId,
      promoId: paramId(req, 'id'),
      updates: parsed.data,
    });

    return res.status(200).json({ promo });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function setPromoBranchAvailabilityController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterId || !requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = branchAvailabilityValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const availability = await setPromoBranchAvailability({
      promoId: paramId(req, 'id'),
      branchId: parsed.data.branch_id,
      isAvailable: parsed.data.is_available,
      requesterRole,
      requesterBranchId,
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archivePromoController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archivePromo(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restorePromoController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restorePromo(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedPromosController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const promos = await listArchivedPromos();
    return res.status(200).json({ promos });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeletePromoController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeletePromo(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Pricing configuration (Epic B #80/#81)
// ---------------------------------------------------------------------------

export async function getPricingConfigurationController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const configuration = await getPricingConfiguration();
    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePricingConfigurationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updatePricingConfigurationValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const configuration = await updatePricingConfiguration({
      requesterId,
      updates: parsed.data,
    });

    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Pet weight class configuration (Architectural-Change-History: the S/M/L/XL
// kg cut-offs used to derive a pet's weight_class from its weight_kg)
// ---------------------------------------------------------------------------

export async function getPetWeightClassConfigurationController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const configuration = await getPetWeightClassConfiguration();
    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePetWeightClassConfigurationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updatePetWeightClassConfigurationValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const configuration = await updatePetWeightClassConfiguration({
      requesterId,
      updates: parsed.data,
    });

    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Package pricing configuration (Epic B #82/#83)
// ---------------------------------------------------------------------------

export async function getPackagePricingConfigurationController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const configuration = await getPackagePricingConfiguration();
    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePackagePricingConfigurationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updatePackagePricingConfigurationValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const configuration = await updatePackagePricingConfiguration({
      requesterId,
      updates: parsed.data,
    });

    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Promo cap configuration (Epic B #84)
// ---------------------------------------------------------------------------

export async function listPromoCapConfigurationsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const configurations = await listPromoCapConfigurations();
    return res.status(200).json({ configurations });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function upsertPromoCapConfigurationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = upsertPromoCapConfigurationValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const configuration = await upsertPromoCapConfiguration({
      requesterId,
      input: parsed.data,
    });

    return res.status(200).json({ configuration });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Breeds (Epic A follow-up - migration 20260725045)
// ---------------------------------------------------------------------------

export async function listBreedsController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    // pet_type is a free-text FK against the admin-managed pet_types table
    // (20260912191), not a fixed 'Dog'/'Cat' union - any non-empty query
    // value is passed straight through.
    const petType = queryString(req.query.pet_type);

    const breeds = await listBreeds({ petType });
    return res.status(200).json({ breeds });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createBreedController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createBreedValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const breed = await createBreed(parsed.data);
    return res.status(201).json({ breed });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateBreedController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateBreedValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const breed = await updateBreed(paramId(req, 'id'), parsed.data);
    return res.status(200).json({ breed });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** DELETE /maintenance/breeds/:id archives (Config-menu consistency change);
 * permanent delete is DELETE .../:id/permanent. */
export async function deleteBreedController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archiveBreed(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Service Types (Custom change)
// ---------------------------------------------------------------------------

export async function listServiceTypesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const serviceTypes = await listServiceTypes();
    return res.status(200).json({ service_types: serviceTypes });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createServiceTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createServiceTypeValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const serviceType = await createServiceType(parsed.data, requesterId);
    return res.status(201).json({ service_type: serviceType });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateServiceTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updateServiceTypeValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const serviceType = await updateServiceType(
      paramId(req, 'id'),
      parsed.data,
      requesterId
    );
    return res.status(200).json({ service_type: serviceType });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function setServiceTypeBranchAvailabilityController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterId || !requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = branchAvailabilityValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const availability = await setServiceTypeBranchAvailability({
      serviceTypeId: paramId(req, 'id'),
      branchId: parsed.data.branch_id,
      isAvailable: parsed.data.is_available,
      requesterRole,
      requesterBranchId,
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Pet Types (Architectural-Change-History: admin CRUD + fixed-price override)
// ---------------------------------------------------------------------------

export async function listPetTypesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const petTypes = await listPetTypes();
    return res.status(200).json({ pet_types: petTypes });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createPetTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createPetTypeValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const petType = await createPetType(parsed.data);
    return res.status(201).json({ pet_type: petType });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePetTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updatePetTypeValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const petType = await updatePetType(paramId(req, 'id'), parsed.data);
    return res.status(200).json({ pet_type: petType });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** DELETE /maintenance/pet-types/:id archives (Config-menu consistency
 * change); permanent delete is DELETE .../:id/permanent. */
export async function deletePetTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archivePetType(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPetTypePriceOverridesController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const overrides = await listPetTypePriceOverrides({
      branchId: queryString(req.query.branch_id),
    });
    return res.status(200).json({ pet_type_price_overrides: overrides });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function upsertPetTypePriceOverrideController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = upsertPetTypePriceOverrideValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const override = await upsertPetTypePriceOverride({
      input: parsed.data,
      requesterRole,
      requesterBranchId,
    });
    return res.status(200).json({ pet_type_price_override: override });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deletePetTypePriceOverrideController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await deletePetTypePriceOverride({
      overrideId: paramId(req, 'id'),
      requesterRole,
      requesterBranchId,
    });
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Archive / restore / permanent delete (Config-menu consistency change)
// Archive itself is the DELETE /:id route on breeds/pet-types/services/
// service-types - see deleteBreedController etc. above.
// ---------------------------------------------------------------------------

export async function listArchivedBreedsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const breeds = await listArchivedBreeds();
    return res.status(200).json({ breeds });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreBreedController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restoreBreed(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteBreedController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteBreed(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedPetTypesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const petTypes = await listArchivedPetTypes();
    return res.status(200).json({ pet_types: petTypes });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restorePetTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restorePetType(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeletePetTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeletePetType(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedServicesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const services = await listServices({ archivedOnly: true });
    return res.status(200).json({ services });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveServiceController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archiveService(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreServiceController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restoreService(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteServiceController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteService(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedServiceTypesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const serviceTypes = await listArchivedServiceTypes();
    return res.status(200).json({ service_types: serviceTypes });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveServiceTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await archiveServiceType(paramId(req, 'id'), requesterId);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreServiceTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await restoreServiceType(paramId(req, 'id'), requesterId);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteServiceTypeController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteServiceType(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
