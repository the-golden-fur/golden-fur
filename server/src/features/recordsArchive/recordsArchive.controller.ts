import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  listDeletedRecordTables,
  listDeletedRecords,
  purgeDeletedRecord,
  restoreDeletedRecord,
} from './services/recordsArchive.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    error instanceof Error && 'statusCode' in error
      ? Number((error as Error & { statusCode?: number }).statusCode)
      : 500;

  const message =
    error instanceof Error ? error.message : 'Internal server error';

  return res.status(statusCode).json({ error: message });
}

function paramId(req: AuthenticatedRequest, name: string): string | undefined {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

const listDeletedRecordsQueryValidator = z.object({
  table: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  sort: z
    .enum(['deleted_at_desc', 'deleted_at_asc'])
    .default('deleted_at_desc'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listDeletedRecordsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = listDeletedRecordsQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  const { table, search, from, to, sort, page, page_size } = parsed.data;

  try {
    const result = await listDeletedRecords({
      table,
      search,
      from,
      to,
      sort,
      limit: page_size,
      offset: (page - 1) * page_size,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listDeletedRecordTablesController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const tables = await listDeletedRecordTables();
    return res.status(200).json({ tables });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreDeletedRecordController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const id = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entry = await restoreDeletedRecord(id as string, requesterId);
    return res.status(200).json({ entry });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function purgeDeletedRecordController(
  req: AuthenticatedRequest,
  res: Response
) {
  const id = paramId(req, 'id');

  try {
    await purgeDeletedRecord(id as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
