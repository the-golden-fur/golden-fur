import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { checkInHotelStay } from './services/careInstructions.service.ts';
import {
  completeCareLogEntry,
  getTodayCareLogEntries,
} from './services/careLogCompletion.service.ts';
import { getFlaggedCareLogEntries } from './services/careLogFlagging.service.ts';
import {
  getAvailableCageCountsBySize,
  getCageGrid,
  setCageMaintenanceStatus,
} from './services/cageStatus.service.ts';
import { checkOutHotelStay } from './services/checkout.service.ts';
import {
  listHotelStays,
  type HotelStayFilterStatus,
} from './services/hotelStay.service.ts';
import { suggestCage } from './services/cageAssignment.service.ts';
import { getCurrentPrescription } from '../veterinary/services/currentPrescription.service.ts';
import {
  createFoodCatalogItem,
  deleteFoodCatalogItem,
  listFoodCatalog,
  updateFoodCatalogItem,
} from './services/foodCatalog.service.ts';
import {
  createMedicationCatalogItem,
  deleteMedicationCatalogItem,
  listMedicationCatalog,
  updateMedicationCatalogItem,
} from './services/medicationCatalog.service.ts';
import {
  cageStatusUpdateValidator,
  checkInValidator,
  createCatalogItemValidator,
  updateCatalogItemValidator,
} from './modules/validators/hotel.validator.ts';

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
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

export async function checkInController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const branchId = req.user?.branch_id;

  if (!requesterId || !branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = checkInValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await checkInHotelStay({
      requesterId,
      branchId,
      input: parsed.data,
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function suggestCageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const suggestion = await suggestCage(paramId(req, 'petId'), branchId);
    return res.status(200).json(suggestion);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function currentPrescriptionController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const prescription = await getCurrentPrescription(paramId(req, 'petId'));
    return res.status(200).json({ prescription });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function completeCareLogEntryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entry = await completeCareLogEntry({
      entryId: paramId(req, 'id'),
      completedByStaffId: requesterId,
    });

    return res.status(200).json({ entry });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function todayCareLogEntriesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entries = await getTodayCareLogEntries({
      branchId,
      date: new Date().toISOString().slice(0, 10),
    });

    return res.status(200).json({ entries });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function flaggedCareLogEntriesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const role = req.user?.role;
  const branchId = req.user?.branch_id;

  if (!role || !branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entries = await getFlaggedCareLogEntries({
      branchId: role === 'Superadmin' ? null : branchId,
      today: new Date().toISOString().slice(0, 10),
    });

    return res.status(200).json({ entries });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function cageGridController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const grid = await getCageGrid(branchId);
    return res.status(200).json({ grid });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function availableCageCountsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const counts = await getAvailableCageCountsBySize(branchId);
    return res.status(200).json({ counts });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateCageStatusController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = cageStatusUpdateValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const cage = await setCageMaintenanceStatus(
      paramId(req, 'id'),
      branchId,
      parsed.data.status
    );

    return res.status(200).json({ cage });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listFoodCatalogController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const items = await listFoodCatalog();
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createFoodCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createCatalogItemValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await createFoodCatalogItem(parsed.data);
    return res.status(201).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateFoodCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateCatalogItemValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await updateFoodCatalogItem(paramId(req, 'id'), parsed.data);
    return res.status(200).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteFoodCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await deleteFoodCatalogItem(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listMedicationCatalogController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const items = await listMedicationCatalog();
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createMedicationCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createCatalogItemValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await createMedicationCatalogItem(parsed.data);
    return res.status(201).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateMedicationCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateCatalogItemValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await updateMedicationCatalogItem(
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteMedicationCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await deleteMedicationCatalogItem(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

const VALID_STAY_STATUSES = new Set(['In Progress', 'Completed', 'Paid']);

export async function listHotelStaysController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const statusParam = req.query.status;
  const status =
    typeof statusParam === 'string' && VALID_STAY_STATUSES.has(statusParam)
      ? (statusParam as HotelStayFilterStatus)
      : undefined;

  try {
    const stays = await listHotelStays({ branchId, status });
    return res.status(200).json({ stays });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function checkoutController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await checkOutHotelStay({
      stayId: paramId(req, 'id'),
      branchId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}
