import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  createDiscount,
  getDiscountById,
  listDiscounts,
  updateDiscount,
} from './services/discounts.service.ts';
import {
  createDiscountValidator,
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
