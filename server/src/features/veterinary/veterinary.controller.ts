import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  getConsultation,
  listConsultationQueue,
  listPetConsultationHistory,
  listVeterinarianPatients,
  updateConsultation,
} from './services/consultation.service.ts';
import { getCurrentPrescription } from './services/currentPrescription.service.ts';
import { linkFollowUpBooking } from './services/followUp.service.ts';
import { upsertPetHealthConditions } from './services/petHealthConditions.service.ts';
import {
  createMedicationCatalogItem,
  createProcedureCatalogItem,
  deleteMedicationCatalogItem,
  deleteProcedureCatalogItem,
  listMedicationCatalog,
  listProcedureCatalog,
  updateMedicationCatalogItem,
  updateProcedureCatalogItem,
} from './services/vetCatalog.service.ts';
import {
  createMedicationCatalogItemValidator,
  createProcedureCatalogItemValidator,
  linkFollowUpValidator,
  updateConsultationValidator,
  updateMedicationCatalogItemValidator,
  updateProcedureCatalogItemValidator,
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
  const dateFrom = queryDate(req, 'date_from');
  const dateTo = queryDate(req, 'date_to');

  try {
    const consultations = await listConsultationQueue({ dateFrom, dateTo });
    return res.status(200).json({ consultations });
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

export async function linkFollowUpBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = linkFollowUpValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await linkFollowUpBooking({
      consultationId: paramId(req, 'id'),
      bookingId: parsed.data.booking_id,
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

export async function listMyPatientsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const patients = await listVeterinarianPatients(requesterId);
    return res.status(200).json({ patients });
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

export async function listMedicationCatalogController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const medications = await listMedicationCatalog(requesterId);
    return res.status(200).json({ medications });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createMedicationCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createMedicationCatalogItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const medication = await createMedicationCatalogItem(
      requesterId,
      parsed.data
    );
    return res.status(201).json({ medication });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateMedicationCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updateMedicationCatalogItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const medication = await updateMedicationCatalogItem(
      requesterId,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ medication });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteMedicationCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await deleteMedicationCatalogItem(requesterId, paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listProcedureCatalogController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const procedures = await listProcedureCatalog(requesterId);
    return res.status(200).json({ procedures });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createProcedureCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createProcedureCatalogItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const procedure = await createProcedureCatalogItem(
      requesterId,
      parsed.data
    );
    return res.status(201).json({ procedure });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateProcedureCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updateProcedureCatalogItemValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const procedure = await updateProcedureCatalogItem(
      requesterId,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ procedure });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteProcedureCatalogItemController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await deleteProcedureCatalogItem(requesterId, paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
