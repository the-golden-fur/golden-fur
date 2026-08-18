import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  createService,
  getServiceById,
  listServices,
  setServiceBranchAvailability,
  updateService,
} from './services/services.service.ts';
import {
  archivePackage,
  createPackage,
  getPackageById,
  hardDeletePackage,
  listArchivedPackages,
  listPackages,
  restorePackage,
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
  updatePromo,
} from './services/promos.service.ts';
import {
  createBreed,
  deleteBreed,
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
  listPromoCapConfigurations,
  upsertPromoCapConfiguration,
} from './services/promoCap.service.ts';
import {
  createServiceType,
  listServiceTypes,
  setServiceTypeBranchAvailability,
  updateServiceType,
} from './services/serviceTypes.service.ts';
import {
  branchAvailabilityValidator,
  createBreedValidator,
  createPackageValidator,
  createPromoValidator,
  createServiceTypeValidator,
  createServiceValidator,
  updateBreedValidator,
  updatePackagePricingConfigurationValidator,
  updatePackageValidator,
  updatePricingConfigurationValidator,
  updatePromoValidator,
  updateServiceTypeValidator,
  updateServiceValidator,
  upsertPromoCapConfigurationValidator,
} from './modules/validators/maintenance.validator.ts';
import type { PetType } from './maintenance.types.ts';

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
    const service = await createService({ requesterId, input: parsed.data });
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

  if (!requesterId) {
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
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
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
    const pkg = await createPackage({ requesterId, input: parsed.data });
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
      packageId: paramId(req, 'id'),
      updates: parsed.data,
    });

    return res.status(200).json({ package: pkg });
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
      branchScope: queryString(req.query.branch_scope),
      includeInactive: req.query.include_inactive === 'true',
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
    const petTypeParam = queryString(req.query.pet_type);
    const petType =
      petTypeParam === 'Dog' || petTypeParam === 'Cat'
        ? (petTypeParam as PetType)
        : undefined;

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

export async function deleteBreedController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await deleteBreed(paramId(req, 'id'));
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

  if (!requesterId) {
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
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
