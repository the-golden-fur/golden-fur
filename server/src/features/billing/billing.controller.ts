import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  buildCheckoutPreview,
  checkoutBooking,
} from './services/checkoutAggregation.service.ts';
import {
  createMiscSale,
  deleteMiscSale,
  getMiscSale,
  listMiscSales,
  updateMiscSale,
} from './services/miscSale.service.ts';
import { getPaymongoServiceFeeRate } from './services/paymongo.service.ts';
import {
  checkoutValidator,
  createMiscSaleValidator,
  updateMiscSaleValidator,
} from './modules/validators/billing.validator.ts';

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

export async function paymongoFeeRateController(
  _req: AuthenticatedRequest,
  res: Response
) {
  return res.status(200).json({ feePercent: getPaymongoServiceFeeRate() });
}

/** Read-only preview backing the cashier checkout screen's line-item list
 * (Issue #86 AC-1) - computes everything checkoutController would, without
 * creating a transaction. */
export async function previewCheckoutController(
  req: AuthenticatedRequest,
  res: Response
) {
  const bookingId = paramId(req, 'bookingId');

  try {
    const preview = await buildCheckoutPreview(bookingId, {
      seniorCitizenEligible: req.query.senior_citizen_eligible === 'true',
      pwdEligible: req.query.pwd_eligible === 'true',
    });
    return res.status(200).json(preview);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function checkoutController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = checkoutValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await checkoutBooking(requesterId, parsed.data);
    return res.status(201).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createMiscSaleController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const branchId = req.user?.branch_id;

  if (!requesterId || !branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createMiscSaleValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await createMiscSale({
      requesterId,
      branchId,
      input: parsed.data,
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listMiscSalesController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const transactions = await listMiscSales(queryString(req.query.branch_id));
    return res.status(200).json({ transactions });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getMiscSaleController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const result = await getMiscSale(paramId(req, 'id'));
    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateMiscSaleController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateMiscSaleValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await updateMiscSale({
      transactionId: paramId(req, 'id'),
      updates: parsed.data,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteMiscSaleController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await deleteMiscSale(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
