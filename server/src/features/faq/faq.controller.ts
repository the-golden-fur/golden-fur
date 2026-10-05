import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  createFaqValidator,
  updateFaqValidator,
} from './modules/validators/faq.validator.ts';
import {
  createFaq,
  deleteFaq,
  listAllFaqs,
  listPublicFaqs,
  updateFaq,
} from './services/faq.service.ts';

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

/** No auth in front of this one (see faq.routes.ts) - the mascot is on the
 * marketing pages too, in front of visitors who haven't logged in. */
export async function listPublicFaqsController(_req: Request, res: Response) {
  try {
    return res.status(200).json({ faqs: await listPublicFaqs() });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listAllFaqsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    return res.status(200).json({ faqs: await listAllFaqs() });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createFaqController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = createFaqValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    return res.status(201).json({ faq: await createFaq(parsed.data) });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateFaqController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updateFaqValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    return res
      .status(200)
      .json({ faq: await updateFaq(paramId(req, 'id'), parsed.data) });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteFaqController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    await deleteFaq(paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
