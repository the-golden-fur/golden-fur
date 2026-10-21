import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { jwtMiddleware } from '../../../shared/auth/middleware/jwt/jwt.middleware.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';
import {
  archivePetController,
  createPetController,
  deactivatePetController,
  getPetController,
  hardDeletePetController,
  listArchivedPetsController,
  listCustomerPetsController,
  restorePetController,
  updatePetController,
} from './pet.controller.ts';
import { uploadPetPhoto } from './services/petPhotoUpload.service.ts';
import { uploadPetCareItemPhoto } from './services/petCareItemPhotoUpload.service.ts';
import {
  createMedicalNote,
  listMedicalNotes,
} from './services/medicalNote.service.ts';
import {
  createVaccinationRecord,
  deleteVaccinationRecord,
  listPendingVaccinationRecords,
  listVaccinationRecords,
  reviewVaccinationRecord,
  updateVaccinationRecord,
} from './services/vaccinationRecord.service.ts';
import type { VaccinationProofFile } from './services/vaccinationProof.service.ts';
import { getPetHealthConditions } from '../../veterinary/services/petHealthConditions.service.ts';
import {
  listPetConsultationResultsForRequester,
  listPetPrescriptionsForRequester,
} from '../../veterinary/services/consultation.service.ts';
import { listPetServiceHistory } from './services/petServiceHistory.service.ts';

const router = Router();
const petPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function paramId(req: AuthenticatedRequest, name: string): string | undefined {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    error instanceof Error && 'statusCode' in error
      ? Number((error as Error & { statusCode?: number }).statusCode)
      : 500;

  const message =
    error instanceof Error ? error.message : 'Internal server error';

  return res.status(statusCode).json({ error: message });
}

router.get(
  '/customers/:customerId/pets',
  jwtMiddleware,
  listCustomerPetsController
);
router.post('/customers/:customerId/pets', jwtMiddleware, createPetController);
router.get(
  '/customers/:customerId/pets/archived',
  jwtMiddleware,
  listArchivedPetsController
);

router.get('/pets/archived', jwtMiddleware, listArchivedPetsController);
router.get('/pets/:id', jwtMiddleware, getPetController);
router.patch('/pets/:id', jwtMiddleware, updatePetController);
router.patch('/pets/:id/deactivate', jwtMiddleware, deactivatePetController);
// Archive is the "delete" an owner or staff member performs (soft,
// reversible, still gated behind is_active === false).
router.delete('/pets/:id', jwtMiddleware, archivePetController);
router.post('/pets/:id/restore', jwtMiddleware, restorePetController);
router.delete('/pets/:id/permanent', jwtMiddleware, hardDeletePetController);

router.post(
  '/pets/:id/photo',
  jwtMiddleware,
  petPhotoUpload.single('photo'),
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file as
      | { buffer: Buffer; mimetype: string; originalname: string; size: number }
      | undefined;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const result = await uploadPetPhoto({
        requesterId,
        petId: petId as string,
        file,
      });

      return res.status(200).json({ photo_url: result.photoUrl });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.post(
  '/pets/:id/care-item-photo',
  jwtMiddleware,
  petPhotoUpload.single('photo'),
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file as
      | { buffer: Buffer; mimetype: string; originalname: string; size: number }
      | undefined;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const result = await uploadPetCareItemPhoto({
        requesterId,
        petId: petId as string,
        file,
      });

      return res.status(200).json({ photo_url: result.photoUrl });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

// Customer-reported vaccinations: create/update take an optional 'proof'
// file (the vaccination card), so they accept multipart form data as well
// as JSON. In a form every field is a string, so an empty one means
// "cleared" - normalised to null (or dropped, where null isn't allowed).
const vaccinationProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const VACCINATION_DATE = /^\d{4}-\d{2}-\d{2}$/;
const emptyToNull = (value: unknown) => (value === '' ? null : value);
const emptyToUndefined = (value: unknown) =>
  value === '' ? undefined : value;

const createVaccinationRecordValidator = z
  .object({
    vaccine_name: z.string().trim().min(1, 'Vaccine name is required'),
    date_administered: z
      .string()
      .regex(VACCINATION_DATE, 'Date administered is required'),
    next_due_date: z.preprocess(
      emptyToUndefined,
      z.string().regex(VACCINATION_DATE).optional()
    ),
    notes: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  })
  .strict();

const updateVaccinationRecordValidator = z
  .object({
    vaccine_name: z.string().trim().min(1).optional(),
    date_administered: z.string().regex(VACCINATION_DATE).optional(),
    next_due_date: z.preprocess(
      emptyToNull,
      z.string().regex(VACCINATION_DATE).nullable().optional()
    ),
    notes: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  })
  .strict();

const reviewVaccinationRecordValidator = z
  .object({
    decision: z.enum(['verify', 'reject']),
    reason: z.string().optional(),
  })
  .strict();

function proofFile(req: AuthenticatedRequest): VaccinationProofFile | undefined {
  return req.file as VaccinationProofFile | undefined;
}

// Staff review queue - listed before the /pets/:id routes it doesn't
// share a prefix with, purely for readability.
router.get(
  '/vaccination-records/pending',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const records = await listPendingVaccinationRecords(requesterId);
      return res.status(200).json({ records });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.post(
  '/pets/:id/vaccination-records',
  jwtMiddleware,
  vaccinationProofUpload.single('proof'),
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = createVaccinationRecordValidator.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid payload', details: parsed.error.issues });
    }

    try {
      const record = await createVaccinationRecord({
        requesterId,
        petId: petId as string,
        vaccineName: parsed.data.vaccine_name,
        dateAdministered: parsed.data.date_administered,
        nextDueDate: parsed.data.next_due_date,
        notes: parsed.data.notes,
        proofFile: proofFile(req),
      });

      return res.status(201).json({ record });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.get(
  '/pets/:id/vaccination-records',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const records = await listVaccinationRecords({
        requesterId,
        petId: petId as string,
      });

      return res.status(200).json({ records });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.patch(
  '/pets/:id/vaccination-records/:recordId',
  jwtMiddleware,
  vaccinationProofUpload.single('proof'),
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');
    const recordId = paramId(req, 'recordId');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = updateVaccinationRecordValidator.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid payload', details: parsed.error.issues });
    }

    try {
      const record = await updateVaccinationRecord({
        requesterId,
        petId: petId as string,
        recordId: recordId as string,
        updates: parsed.data,
        proofFile: proofFile(req),
      });

      return res.status(200).json({ record });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.post(
  '/pets/:id/vaccination-records/:recordId/review',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');
    const recordId = paramId(req, 'recordId');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = reviewVaccinationRecordValidator.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid payload', details: parsed.error.issues });
    }

    try {
      const record = await reviewVaccinationRecord({
        requesterId,
        petId: petId as string,
        recordId: recordId as string,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
      });

      return res.status(200).json({ record });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.delete(
  '/pets/:id/vaccination-records/:recordId',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');
    const recordId = paramId(req, 'recordId');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await deleteVaccinationRecord({
        requesterId,
        petId: petId as string,
        recordId: recordId as string,
      });

      return res.status(204).send();
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

const MEDICAL_NOTE_CATEGORIES = [
  'Medical Note',
  'Allergy',
  'Behavioral Flag',
] as const;

const createMedicalNoteValidator = z
  .object({
    note_text: z.string().trim().min(1, 'Note text is required'),
    category: z.enum(MEDICAL_NOTE_CATEGORIES),
  })
  .strict();

router.post(
  '/pets/:id/medical-notes',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = createMedicalNoteValidator.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid payload', details: parsed.error.issues });
    }

    try {
      const note = await createMedicalNote({
        requesterId,
        petId: petId as string,
        noteText: parsed.data.note_text,
        category: parsed.data.category,
      });

      return res.status(201).json({ note });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.get(
  '/pets/:id/medical-notes',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const notes = await listMedicalNotes({
        requesterId,
        petId: petId as string,
      });

      return res.status(200).json({ notes });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

// Deliberately no PATCH/DELETE route for /pets/:id/medical-notes/:noteId -
// medical notes are an append-only annotation trail (AC-6).

// Issue #78: read-only from the pet-profile side - writes only happen via
// the Veterinary console (PATCH /veterinary/pets/:petId/health-conditions,
// Veterinarian-only). Any authenticated staff role or the owning customer
// may read (service-level check, same shape as medical notes/vaccination
// records above).
router.get(
  '/pets/:id/health-conditions',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const healthConditions = await getPetHealthConditions({
        requesterId,
        petId: petId as string,
      });

      return res.status(200).json({ health_conditions: healthConditions });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

// #117: read-only, same shape as /pets/:id/health-conditions above - any
// authenticated staff role or the owning customer may read (service-level
// ownership check inside listPetPrescriptionsForRequester/
// listPetConsultationResultsForRequester). Writes only happen via the
// Consultation form (PATCH /veterinary/consultations/:id, Veterinarian-only).
router.get(
  '/pets/:id/prescriptions',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const prescriptions = await listPetPrescriptionsForRequester({
        requesterId,
        petId: petId as string,
      });

      return res.status(200).json({ prescriptions });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

router.get(
  '/pets/:id/consultation-results',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const results = await listPetConsultationResultsForRequester({
        requesterId,
        petId: petId as string,
      });

      return res.status(200).json({ results });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

// Read-only, same access as the two routes above (owning customer or any
// staff role) - the pet's past Completed/Cancelled/No-show bookings.
router.get(
  '/pets/:id/service-history',
  jwtMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = req.user?.sub;
    const petId = paramId(req, 'id');

    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const history = await listPetServiceHistory({
        requesterId,
        petId: petId as string,
      });

      return res.status(200).json({ history });
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
);

export default router;
