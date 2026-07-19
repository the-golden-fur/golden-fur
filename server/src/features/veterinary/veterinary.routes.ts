import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  getConsultationController,
  getCurrentPrescriptionController,
  getPetConsultationHistoryController,
  listConsultationQueueController,
  scheduleFollowUpController,
  updateConsultationController,
} from './veterinary.controller.ts';
import { VETERINARY_READ_ROLES, VETERINARY_WRITE_ROLES } from './veterinary.types.ts';

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
  scheduleFollowUpController
);

router.get(
  '/veterinary/pets/:petId/history',
  staffRead,
  getPetConsultationHistoryController
);

router.get(
  '/veterinary/pets/:petId/current-prescription',
  staffRead,
  getCurrentPrescriptionController
);

export default router;
