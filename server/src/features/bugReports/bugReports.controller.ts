import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  createBugReportValidator,
  updateBugReportStatusValidator,
} from './modules/validators/bugReports.validator.ts';
import {
  createBugReport,
  listBugReports,
  updateBugReportStatus,
} from './services/bugReports.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

/** Open to any authenticated customer or staff member (bugReports.routes.ts
 * - no role gate) - createBugReport itself resolves which reporter column
 * to set, from an actual staff_profiles lookup rather than any JWT claim. */
export async function createBugReportController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createBugReportValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const report = await createBugReport({ ...parsed.data, requesterId });
    return res.status(201).json({ report });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listBugReportsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    return res.status(200).json({ reports: await listBugReports() });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateBugReportStatusController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateBugReportStatusValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const report = await updateBugReportStatus({
      requesterId,
      reportId: paramId(req, 'id'),
      status: parsed.data.status,
    });
    return res.status(200).json({ report });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
