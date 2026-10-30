import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  archiveFoodItem,
  createFoodItem,
  listMineFoodItems,
  listPickableFoodItems,
  updateFoodItem,
} from './services/staffFoodItems.service.ts';
import {
  archiveMedicationItem,
  createMedicationItem,
  listMineMedicationItems,
  listPickableMedicationItems,
  updateMedicationItem,
} from './services/staffMedicationItems.service.ts';
import {
  createStaffFoodItemValidator,
  createStaffMedicationItemValidator,
  updateStaffFoodItemValidator,
  updateStaffMedicationItemValidator,
} from './modules/validators/staffItems.validator.ts';

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

function requireCaller(
  req: AuthenticatedRequest,
  res: Response
): { staffId: string; staffRole: string } | null {
  const staffId = req.user?.sub;
  const staffRole = req.user?.role;
  if (!staffId || !staffRole) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return { staffId, staffRole };
}

export async function listMineFoodItemsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  try {
    const items = await listMineFoodItems(caller.staffId);
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPickableFoodItemsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  try {
    const items = await listPickableFoodItems(caller.staffId);
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createFoodItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  const parsed = createStaffFoodItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await createFoodItem(caller.staffId, parsed.data);
    return res.status(201).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateFoodItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  const parsed = updateStaffFoodItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await updateFoodItem(
      caller.staffId,
      caller.staffRole,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveFoodItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  try {
    await archiveFoodItem(caller.staffId, caller.staffRole, paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listMineMedicationItemsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  try {
    const items = await listMineMedicationItems(caller.staffId);
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPickableMedicationItemsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  try {
    const items = await listPickableMedicationItems(caller.staffId);
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createMedicationItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  const parsed = createStaffMedicationItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await createMedicationItem(caller.staffId, parsed.data);
    return res.status(201).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateMedicationItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  const parsed = updateStaffMedicationItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await updateMedicationItem(
      caller.staffId,
      caller.staffRole,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveMedicationItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const caller = requireCaller(req, res);
  if (!caller) return;

  try {
    await archiveMedicationItem(
      caller.staffId,
      caller.staffRole,
      paramId(req, 'id')
    );
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
