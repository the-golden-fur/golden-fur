import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  archiveProduct,
  createProduct,
  hardDeleteProduct,
  listArchivedProducts,
  listProducts,
  restoreProduct,
  updateProduct,
} from './services/productCatalog.service.ts';
import {
  createProductValidator,
  updateProductValidator,
} from './modules/validators/catalog.validator.ts';

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

export async function listProductsController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const items = await listProducts({
      category: queryString(req.query.category),
      serviceScope: queryString(req.query.service_scope),
      activeOnly: req.query.active_only === 'true',
    });

    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createProductController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createProductValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await createProduct(parsed.data);
    return res.status(201).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateProductController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateProductValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const item = await updateProduct(paramId(req, 'id'), parsed.data);
    return res.status(200).json({ item });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveProductController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await archiveProduct(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreProductController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await restoreProduct(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedProductsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const items = await listArchivedProducts();
    return res.status(200).json({ items });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteProductController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await hardDeleteProduct(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
