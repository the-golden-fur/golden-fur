import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  createLandingReviewValidator,
  updateLandingContentValidator,
  updateLandingReviewValidator,
  updateLandingSectionValidator,
} from './modules/validators/landing.validator.ts';
import {
  createLandingReview,
  deleteLandingReview,
  getLandingAdminContent,
  getPublicLandingContent,
  updateLandingContent,
  updateLandingReview,
  updateLandingSection,
} from './services/landing.service.ts';
import {
  resetLandingImage,
  uploadLandingImage,
  type LandingImageFile,
} from './services/landingImage.service.ts';
import { listPublicBranches } from './services/publicBranches.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

function invalidPayload(res: Response, issues: unknown) {
  return res.status(400).json({ error: 'Invalid payload', details: issues });
}

function paramValue(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

/** No auth in front of the two public reads (see landing.routes.ts) - the
 * landing page is shown to visitors who haven't logged in. */
export async function getPublicLandingController(
  _req: Request,
  res: Response
) {
  try {
    return res.status(200).json(await getPublicLandingContent());
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPublicBranchesController(
  _req: Request,
  res: Response
) {
  try {
    return res.status(200).json({ branches: await listPublicBranches() });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getLandingAdminController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    return res.status(200).json(await getLandingAdminContent());
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateLandingContentController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateLandingContentValidator.safeParse(req.body);
  if (!parsed.success) return invalidPayload(res, parsed.error.issues);

  try {
    return res
      .status(200)
      .json({ content: await updateLandingContent(parsed.data) });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateLandingSectionController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateLandingSectionValidator.safeParse(req.body);
  if (!parsed.success) return invalidPayload(res, parsed.error.issues);

  try {
    return res.status(200).json({
      section: await updateLandingSection(
        paramValue(req, 'key'),
        parsed.data.is_visible
      ),
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createLandingReviewController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createLandingReviewValidator.safeParse(req.body);
  if (!parsed.success) return invalidPayload(res, parsed.error.issues);

  try {
    return res
      .status(201)
      .json({ review: await createLandingReview(parsed.data) });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateLandingReviewController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateLandingReviewValidator.safeParse(req.body);
  if (!parsed.success) return invalidPayload(res, parsed.error.issues);

  try {
    return res.status(200).json({
      review: await updateLandingReview(paramValue(req, 'id'), parsed.data),
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteLandingReviewController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await deleteLandingReview(paramValue(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** Turns multer's own failures (e.g. the 5 MB limit) into a 400, same as
 * staff.controller.ts's handleAvatarUploadError. An error that already has a
 * status - requireRole's 403, which also reaches this error handler since it
 * sits later in the chain - is passed on untouched. */
export function handleLandingImageUploadError(
  err: unknown,
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message,
    });
  }

  if (err && (err as { statusCode?: number }).statusCode) {
    return next(err);
  }

  if (err) {
    return res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }

  return next();
}

export async function uploadLandingImageController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    return res.status(200).json({
      item: await uploadLandingImage(
        paramValue(req, 'key'),
        req.file as LandingImageFile | undefined
      ),
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function resetLandingImageController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    return res
      .status(200)
      .json({ item: await resetLandingImage(paramValue(req, 'key')) });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
