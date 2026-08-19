import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { checkInHotelStay } from './services/careInstructions.service.ts';
import {
  completeCareLogEntry,
  getCareLogEntries,
  reopenCareLogEntry,
  startCareLogEntry,
} from './services/careLogCompletion.service.ts';
import {
  createCage,
  deleteCage,
  getAvailableCageCountsBySize,
  getCageGrid,
  setCageMaintenanceStatus,
  updateCage,
} from './services/cageStatus.service.ts';
import { checkOutHotelStay } from './services/checkout.service.ts';
import { listHotelStays } from './services/hotelStay.service.ts';
import { suggestCage } from './services/cageAssignment.service.ts';
import { getCurrentPrescription } from '../veterinary/services/currentPrescription.service.ts';
import { listActivityLog } from './services/activityLog.service.ts';
import {
  activityLogQueryValidator,
  cageStatusUpdateValidator,
  careLogEntriesQueryValidator,
  checkInValidator,
  createCageValidator,
  listHotelStaysQueryValidator,
  updateCageValidator,
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

/** Custom change (Boarding Checklist Kanban): Pending -> In Progress. */
export async function startCareLogEntryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entry = await startCareLogEntry({
      entryId: paramId(req, 'id'),
      actorStaffId: requesterId,
    });
    return res.status(200).json({ entry });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** Custom change (Boarding Checklist Kanban): back to Pending. */
export async function reopenCareLogEntryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entry = await reopenCareLogEntry({
      entryId: paramId(req, 'id'),
      actorStaffId: requesterId,
    });
    return res.status(200).json({ entry });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** Custom change (Boarding Checklist Kanban redesign): still backs
 * GET /hotel/care-log/today, but now accepts optional date_from/date_to
 * query params (both omitted = today only, unchanged default behavior). */
export async function careLogEntriesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = careLogEntriesQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  // Both omitted = the original "today only" default; either one supplied
  // means the caller is deliberately using a range (e.g. QueueFilterBar's
  // "All dates" preset, which supplies neither bound at all).
  const bothOmitted = !parsed.data.date_from && !parsed.data.date_to;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const entries = await getCareLogEntries({
      branchId,
      dateFrom: bothOmitted ? today : parsed.data.date_from,
      dateTo: bothOmitted ? today : parsed.data.date_to,
    });

    return res.status(200).json({ entries });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** Custom change: Hotel/Daycare activity logbook (#48 follow-up). Superadmin
 * sees every branch (branchId: null), same convention as the now-removed
 * flaggedCareLogEntriesController's cross-branch view. */
export async function activityLogController(
  req: AuthenticatedRequest,
  res: Response
) {
  const role = req.user?.role;
  const branchId = req.user?.branch_id;

  if (!role || !branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = activityLogQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const entries = await listActivityLog({
      branchId: role === 'Superadmin' ? null : branchId,
      stayId: parsed.data.stay_id,
      dateFrom: parsed.data.date_from,
      dateTo: parsed.data.date_to,
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

/** Custom change (Cage CRUD, Settings > Config). */
export async function createCageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createCageValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const cage = await createCage({
      branchId,
      cageLabel: parsed.data.cage_label,
      size: parsed.data.size,
    });

    return res.status(201).json({ cage });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateCageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updateCageValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const cage = await updateCage({
      cageId: paramId(req, 'id'),
      branchId,
      cageLabel: parsed.data.cage_label,
      size: parsed.data.size,
    });

    return res.status(200).json({ cage });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteCageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await deleteCage({ cageId: paramId(req, 'id'), branchId });
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// Food/medication catalog CRUD moved to features/catalog/ (Sprint 5
// unification, #82) - see catalog.controller.ts's listProductsController/
// createProductController/updateProductController/deleteProductController.

export async function listHotelStaysController(
  req: AuthenticatedRequest,
  res: Response
) {
  const branchId = req.user?.branch_id;

  if (!branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = listHotelStaysQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const stays = await listHotelStays({
      branchId,
      status: parsed.data.status,
      dateFrom: parsed.data.date_from,
      dateTo: parsed.data.date_to,
    });
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
      requesterId: req.user?.sub,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}
