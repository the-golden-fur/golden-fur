import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  createMedicationCatalogItemController,
  createProcedureCatalogItemController,
  deleteMedicationCatalogItemController,
  deleteProcedureCatalogItemController,
  getConsultationController,
  getCurrentPrescriptionController,
  getPetConsultationHistoryController,
  listConsultationQueueController,
  listMedicationCatalogController,
  linkFollowUpBookingController,
  listMyPatientsController,
  listProcedureCatalogController,
  updateConsultationController,
  updateMedicationCatalogItemController,
  updateProcedureCatalogItemController,
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

router.get(
  '/veterinary/procedure-catalog',
  vetWrite,
  listProcedureCatalogController
);
router.post(
  '/veterinary/procedure-catalog',
  vetWrite,
  createProcedureCatalogItemController
);
router.patch(
  '/veterinary/procedure-catalog/:id',
  vetWrite,
  updateProcedureCatalogItemController
);
router.delete(
  '/veterinary/procedure-catalog/:id',
  vetWrite,
  deleteProcedureCatalogItemController
);

export default router;
