import { Router } from 'express';
import multer from 'multer';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  createConsultationFormTemplateController,
  createMedicationCatalogItemController,
  createPrescriptionTemplateController,
  deleteConsultationFormTemplateController,
  deleteMedicationCatalogItemController,
  deletePrescriptionTemplateController,
  getConsultationController,
  getCurrentPrescriptionController,
  getPetConsultationHistoryController,
  handleMedicationImageUploadError,
  listConsultationFormTemplatesController,
  listConsultationQueueController,
  listMedicationCatalogController,
  linkFollowUpBookingController,
  listMyPatientsController,
  listPrescriptionsController,
  listPrescriptionTemplatesController,
  updateConsultationController,
  updateConsultationFormTemplateController,
  updateMedicationCatalogItemController,
  updatePrescriptionTemplateController,
  uploadMedicationImageController,
  upsertHealthConditionsController,
} from './veterinary.controller.ts';
import {
  VETERINARY_READ_ROLES,
  VETERINARY_WRITE_ROLES,
} from './veterinary.types.ts';

/**
 * Issues #66/#67: registered together since #67's follow-up endpoint depends
 * on #66's consultations already existing - both land in the same
 * veterinary.routes.ts, matching the Guide's own Affected Files (only #67
 * lists this file; #66's consultation/current-prescription endpoints are
 * wired here alongside it).
 */
const router = Router();

const staffRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...VETERINARY_READ_ROLES]),
  requireBranch,
];

const vetWrite = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...VETERINARY_WRITE_ROLES]),
  requireBranch,
];

const medicationImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get(
  '/veterinary/consultations/queue',
  staffRead,
  listConsultationQueueController
);

router.get(
  '/veterinary/consultations/:id',
  staffRead,
  getConsultationController
);

router.patch(
  '/veterinary/consultations/:id',
  vetWrite,
  updateConsultationController
);

router.post(
  '/veterinary/consultations/:id/follow-up',
  vetWrite,
  linkFollowUpBookingController
);

router.get(
  '/veterinary/pets/:petId/history',
  staffRead,
  getPetConsultationHistoryController
);

// "My Patients" is inherently self-scoped (the service always filters by
// the requester's own id) - reusing vetWrite here for its role predicate
// (Veterinarian only), not because this is a write.
router.get('/veterinary/my-patients', vetWrite, listMyPatientsController);

router.get(
  '/veterinary/pets/:petId/current-prescription',
  staffRead,
  getCurrentPrescriptionController
);

router.patch(
  '/veterinary/pets/:petId/health-conditions',
  vetWrite,
  upsertHealthConditionsController
);

// Personal medication/procedure catalog - owner-scoped (see
// 20260825142_m07_create_vet_catalog_schema.sql), so vetWrite's
// Veterinarian-only role check is used for reads here too, not just writes -
// there's no "any Veterinarian may read" case like the rest of this feature.
router.get(
  '/veterinary/medication-catalog',
  vetWrite,
  listMedicationCatalogController
);
router.post(
  '/veterinary/medication-catalog',
  vetWrite,
  createMedicationCatalogItemController
);
router.patch(
  '/veterinary/medication-catalog/:id',
  vetWrite,
  updateMedicationCatalogItemController
);
router.delete(
  '/veterinary/medication-catalog/:id',
  vetWrite,
  deleteMedicationCatalogItemController
);

// Custom change: uploads to the 'vet-medication-images' bucket and returns
// a URL, independent of any particular record - the "Add medication" form
// uploads the image first, then sends the resulting image_url along with
// the rest of the create payload (the record may not exist yet at upload
// time). Mirrors maintenance.routes.ts's own '/maintenance/images'.
router.post(
  '/veterinary/medication-images',
  vetWrite,
  medicationImageUpload.single('image'),
  handleMedicationImageUploadError,
  uploadMedicationImageController
);

// #117 consultation form builder: same owner-scoped shape as the medication
// catalog above (vetWrite's Veterinarian-only role check used for reads
// too), replacing the personal procedure catalog this same change drops.
router.get(
  '/veterinary/consultation-form-templates',
  vetWrite,
  listConsultationFormTemplatesController
);
router.post(
  '/veterinary/consultation-form-templates',
  vetWrite,
  createConsultationFormTemplateController
);
router.patch(
  '/veterinary/consultation-form-templates/:id',
  vetWrite,
  updateConsultationFormTemplateController
);
router.delete(
  '/veterinary/consultation-form-templates/:id',
  vetWrite,
  deleteConsultationFormTemplateController
);

// #117: staff-facing "every patient" Prescriptions list page - staffRead,
// not vetWrite, matching the rest of this feature's "any Veterinarian +
// Admin/Supervisor/Superadmin/Receptionist may read" visibility (this
// lists every patient's data, unlike the owner-scoped catalogs above). The
// equivalent standalone Consultation Results list/route was removed -
// results are reached from a "Results" row option on the Consultation
// Queue instead.
router.get('/veterinary/prescriptions', staffRead, listPrescriptionsController);

// Custom change: a vet's personal prescription templates - same
// owner-scoped shape as the medication catalog/consultation-form-templates
// above.
router.get(
  '/veterinary/prescription-templates',
  vetWrite,
  listPrescriptionTemplatesController
);
router.post(
  '/veterinary/prescription-templates',
  vetWrite,
  createPrescriptionTemplateController
);
router.patch(
  '/veterinary/prescription-templates/:id',
  vetWrite,
  updatePrescriptionTemplateController
);
router.delete(
  '/veterinary/prescription-templates/:id',
  vetWrite,
  deletePrescriptionTemplateController
);

export default router;
