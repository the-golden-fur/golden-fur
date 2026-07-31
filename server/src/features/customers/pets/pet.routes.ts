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
import {
  createMedicalNote,
  listMedicalNotes,
} from './services/medicalNote.service.ts';
import {
  createVaccinationRecord,
  deleteVaccinationRecord,
  listVaccinationRecords,
  updateVaccinationRecord,
} from './services/vaccinationRecord.service.ts';
import { getPetHealthConditions } from '../../veterinary/services/petHealthConditions.service.ts';

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

const createVaccinationRecordValidator = z
  .object({
    vaccine_name: z.string().trim().min(1, 'Vaccine name is required'),
    date_administered: z.string().min(1, 'Date administered is required'),
    next_due_date: z.string().min(1).optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

const updateVaccinationRecordValidator = z
  .object({
    vaccine_name: z.string().trim().min(1).optional(),
    date_administered: z.string().min(1).optional(),
    next_due_date: z.string().min(1).nullable().optional(),
    notes: z.string().trim().nullable().optional(),
  })
  .strict();

router.post(
  '/pets/:id/vaccination-records',
  jwtMiddleware,
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

export default router;
