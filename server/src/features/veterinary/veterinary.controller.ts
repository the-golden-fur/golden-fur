import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  getConsultation,
  listConsultationQueue,
  listPetConsultationHistory,
  listUnconfirmedVeterinaryBookings,
  updateConsultation,
} from './services/consultation.service.ts';
import { getCurrentPrescription } from './services/currentPrescription.service.ts';
import { scheduleFollowUp } from './services/followUp.service.ts';
import { upsertPetHealthConditions } from './services/petHealthConditions.service.ts';
import {
  scheduleFollowUpValidator,
  updateConsultationValidator,
  upsertHealthConditionsValidator,
} from './modules/validators/veterinary.validator.ts';

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

function queryDate(
  req: AuthenticatedRequest,
  name: string
): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
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

export async function listConsultationQueueController(
  req: AuthenticatedRequest,
  res: Response
) {
  const includePending = req.query.includePending === 'true';
  const dateFrom = queryDate(req, 'date_from');
  const dateTo = queryDate(req, 'date_to');

  try {
    const consultations = await listConsultationQueue({ dateFrom, dateTo });

    if (!includePending) {
      return res.status(200).json({ consultations });
    }

    const pendingBookings = await listUnconfirmedVeterinaryBookings({
      dateFrom,
      dateTo,
    });
    return res.status(200).json({ consultations, pendingBookings });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getConsultationController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const consultation = await getConsultation(paramId(req, 'id'));
    return res.status(200).json({ consultation });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateConsultationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = updateConsultationValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const consultation = await updateConsultation({
      requesterId,
      consultationId: paramId(req, 'id'),
      input: parsed.data,
    });

    return res.status(200).json({ consultation });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function scheduleFollowUpController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = scheduleFollowUpValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await scheduleFollowUp({
      requesterId,
      consultationId: paramId(req, 'id'),
      followUpDate: parsed.data.follow_up_date,
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getPetConsultationHistoryController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const consultations = await listPetConsultationHistory(
      paramId(req, 'petId')
    );
    return res.status(200).json({ consultations });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getCurrentPrescriptionController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const prescription = await getCurrentPrescription(paramId(req, 'petId'));
    return res.status(200).json({ prescription });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function upsertHealthConditionsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = upsertHealthConditionsValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const healthConditions = await upsertPetHealthConditions({
      requesterId,
      petId: paramId(req, 'petId'),
      conditionsText: parsed.data.conditions_text,
    });

    return res.status(200).json({ health_conditions: healthConditions });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
