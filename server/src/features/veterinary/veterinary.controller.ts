import type { NextFunction, Response } from 'express';
import multer from 'multer';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  getConsultation,
  listConsultationQueue,
  listPetConsultationHistory,
  listPrescriptions,
  listVeterinarianPatients,
  updateConsultation,
} from './services/consultation.service.ts';
import {
  createConsultationFormTemplate,
  deleteConsultationFormTemplate,
  listConsultationFormTemplates,
  updateConsultationFormTemplate,
} from './services/consultationFormTemplate.service.ts';
import { getCurrentPrescription } from './services/currentPrescription.service.ts';
import { linkFollowUpBooking } from './services/followUp.service.ts';
import { upsertPetHealthConditions } from './services/petHealthConditions.service.ts';
import {
  createMedicationCatalogItem,
  deleteMedicationCatalogItem,
  listMedicationCatalog,
  updateMedicationCatalogItem,
} from './services/vetCatalog.service.ts';
import { uploadMedicationImage } from './services/vetMedicationImageUpload.service.ts';
import {
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  listPrescriptionTemplates,
  updatePrescriptionTemplate,
} from './services/vetPrescriptionTemplate.service.ts';
import {
  createConsultationFormTemplateValidator,
  createMedicationCatalogItemValidator,
  createPrescriptionTemplateValidator,
  linkFollowUpValidator,
  updateConsultationFormTemplateValidator,
  updateConsultationValidator,
  updateMedicationCatalogItemValidator,
  updatePrescriptionTemplateValidator,
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
    const consultations = await listConsultationQueue({
      dateFrom,
      dateTo,
      allDates: req.query.all_dates === 'true',
    });
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

// ---------------------------------------------------------------------------
// Medication image upload (mirrors maintenance.controller.ts's own
// service/service-type/package image upload)
// ---------------------------------------------------------------------------

/** Mirrors maintenance.controller.ts's handleServiceImageUploadError -
 * translates a multer failure (e.g. the 5MB limit) into the same JSON error
 * shape every other veterinary endpoint returns, instead of Express's
 * default HTML error page. */
export function handleMedicationImageUploadError(
  err: unknown,
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }

  return next();
}

export async function uploadMedicationImageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const file = req.file as
    | {
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
      }
    | undefined;

  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const imageUrl = await uploadMedicationImage({ file });
    return res.status(201).json({ image_url: imageUrl });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// #117: procedure-catalog controllers removed alongside the rest of the
// personal procedure catalog - replaced by the consultation-form-template
// controllers below.

export async function listConsultationFormTemplatesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const templates = await listConsultationFormTemplates(requesterId);
    return res.status(200).json({ templates });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createConsultationFormTemplateController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createConsultationFormTemplateValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const template = await createConsultationFormTemplate(
      requesterId,
      parsed.data
    );
    return res.status(201).json({ template });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateConsultationFormTemplateController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updateConsultationFormTemplateValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const template = await updateConsultationFormTemplate(
      requesterId,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ template });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteConsultationFormTemplateController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await deleteConsultationFormTemplate(requesterId, paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPrescriptionsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const consultations = await listPrescriptions();
    return res.status(200).json({ consultations });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

// Custom change: the standalone Consultation Results list page (and its
// listConsultationResultsController) was removed - results are reached
// from a "Results" row option on the Consultation Queue instead.

export async function listPrescriptionTemplatesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const templates = await listPrescriptionTemplates(requesterId);
    return res.status(200).json({ templates });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createPrescriptionTemplateController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createPrescriptionTemplateValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const template = await createPrescriptionTemplate(requesterId, parsed.data);
    return res.status(201).json({ template });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePrescriptionTemplateController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = updatePrescriptionTemplateValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const template = await updatePrescriptionTemplate(
      requesterId,
      paramId(req, 'id'),
      parsed.data
    );
    return res.status(200).json({ template });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deletePrescriptionTemplateController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await deletePrescriptionTemplate(requesterId, paramId(req, 'id'));
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
