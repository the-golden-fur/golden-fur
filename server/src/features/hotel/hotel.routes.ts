import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  availableCageCountsController,
  cageGridController,
  checkInController,
  checkoutController,
  completeCareLogEntryController,
  createFoodCatalogItemController,
  createMedicationCatalogItemController,
  currentPrescriptionController,
  deleteFoodCatalogItemController,
  deleteMedicationCatalogItemController,
  flaggedCareLogEntriesController,
  listFoodCatalogController,
  listHotelStaysController,
  listMedicationCatalogController,
  suggestCageController,
  todayCareLogEntriesController,
  updateCageStatusController,
  updateFoodCatalogItemController,
  updateMedicationCatalogItemController,
} from './hotel.controller.ts';
import {
  HOTEL_ADMIN_ROLES,
  HOTEL_FRONT_DESK_ROLES,
  HOTEL_PET_ASSISTANT_ROLES,
} from './hotel.types.ts';

const router = Router();
const frontDeskAndAssistants = [
  ...HOTEL_FRONT_DESK_ROLES,
  ...HOTEL_PET_ASSISTANT_ROLES,
];

// Issue #75
router.post(
  '/hotel/check-in',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_FRONT_DESK_ROLES]),
  requireBranch,
  checkInController
);

router.get(
  '/hotel/pets/:petId/cage-suggestion',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_FRONT_DESK_ROLES]),
  requireBranch,
  suggestCageController
);

router.get(
  '/hotel/pets/:petId/current-prescription',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_FRONT_DESK_ROLES]),
  requireBranch,
  currentPrescriptionController
);

// Issue #76
router.patch(
  '/hotel/care-log-entry/:id/complete',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_PET_ASSISTANT_ROLES]),
  requireBranch,
  completeCareLogEntryController
);

// Issue #80 (pet-assistant-facing daily checklist)
router.get(
  '/hotel/care-log/today',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  todayCareLogEntriesController
);

// Issue #77
router.get(
  '/hotel/care-log/flagged',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_FRONT_DESK_ROLES]),
  requireBranch,
  flaggedCareLogEntriesController
);

// Issue #78
router.get(
  '/hotel/cages',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  cageGridController
);

router.get(
  '/hotel/cages/available',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_FRONT_DESK_ROLES]),
  requireBranch,
  availableCageCountsController
);

router.patch(
  '/hotel/cage/:id/status',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  requireBranch,
  updateCageStatusController
);

// #79 revision: backs both HotelBookingPicker's "already checked in"
// cross-reference and HotelStayPicker's checkout search/filter/sort list.
router.get(
  '/hotel/stays',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  listHotelStaysController
);

router.post(
  '/hotel/stays/:id/checkout',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_FRONT_DESK_ROLES]),
  requireBranch,
  checkoutController
);

// #79 revision: food/medication catalogs. Not branch-scoped (same rationale
// as maintenance.routes.ts's services/packages), so requireBranch is
// deliberately omitted here.
router.get(
  '/hotel/food-catalog',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  listFoodCatalogController
);

router.post(
  '/hotel/food-catalog',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  createFoodCatalogItemController
);

router.patch(
  '/hotel/food-catalog/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  updateFoodCatalogItemController
);

router.delete(
  '/hotel/food-catalog/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  deleteFoodCatalogItemController
);

router.get(
  '/hotel/medication-catalog',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  listMedicationCatalogController
);

router.post(
  '/hotel/medication-catalog',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  createMedicationCatalogItemController
);

router.patch(
  '/hotel/medication-catalog/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  updateMedicationCatalogItemController
);

router.delete(
  '/hotel/medication-catalog/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  deleteMedicationCatalogItemController
);

export default router;
