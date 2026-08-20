import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  archiveDiscount,
  createDiscount,
  getDiscountById,
  hardDeleteDiscount,
  listArchivedDiscounts,
  listDiscounts,
  restoreDiscount,
  setDiscountBranchAvailability,
  updateDiscount,
} from './services/discounts.service.ts';
import {
  createDiscountValidator,
  discountBranchAvailabilityValidator,
  updateDiscountValidator,
} from './modules/validators/discounts.validator.ts';

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

export async function listDiscountsController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const discounts = await listDiscounts({
      branchId: queryString(req.query.branch_id),
      activeOnly: req.query.active_only === 'true',
    });

    return res.status(200).json({ discounts });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getDiscountController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const discount = await getDiscountById(paramId(req, 'id'));
    return res.status(200).json({ discount });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveDiscountController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archiveDiscount(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreDiscountController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restoreDiscount(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedDiscountsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const discounts = await listArchivedDiscounts();
    return res.status(200).json({ discounts });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteDiscountController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteDiscount(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createDiscountController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createDiscountValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const discount = await createDiscount({ requesterId, input: parsed.data });
    return res.status(201).json({ discount });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateDiscountController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updateDiscountValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const discount = await updateDiscount({
      requesterId,
      discountId: paramId(req, 'id'),
      updates: parsed.data,
    });

    return res.status(200).json({ discount });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function setDiscountBranchAvailabilityController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = discountBranchAvailabilityValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const availability = await setDiscountBranchAvailability({
      discountId: paramId(req, 'id'),
      branchId: parsed.data.branch_id,
      isAvailable: parsed.data.is_available,
    });

    return res.status(200).json({ availability });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
