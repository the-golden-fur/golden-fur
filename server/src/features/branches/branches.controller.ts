import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  getBranch,
  listBranchesFull,
  updateBranch,
} from './services/branches.service.ts';
import { updateBranchValidator } from './modules/validators/branches.validator.ts';

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

export async function listBranchesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const branches = await listBranchesFull();
    return res.status(200).json({ branches });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getBranchController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const branch = await getBranch(paramId(req, 'id'));
    return res.status(200).json({ branch });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateBranchController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateBranchValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const branch = await updateBranch(paramId(req, 'id'), parsed.data);
    return res.status(200).json({ branch });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
