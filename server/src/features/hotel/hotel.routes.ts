import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import { requireBranch } from '../auth/staff/middleware/requireBranch/requireBranch.middleware.ts';
import {
  activityLogController,
  availableCageCountsController,
  cageGridController,
  careLogEntriesController,
  checkInController,
  checkoutController,
  completeCareLogEntryController,
  createCageController,
  currentPrescriptionController,
  deleteCageController,
  listHotelStaysController,
  reopenCareLogEntryController,
  startCareLogEntryController,
  suggestCageController,
  updateCageController,
  updateCageStatusController,
} from './hotel.controller.ts';
import { HOTEL_ADMIN_ROLES, HOTEL_ADVANCE_ROLES } from './hotel.types.ts';

const router = Router();
// Care-log-only browsing (today's checklist, the stays/cages lists needed to
// find a pet) is open to Groomer/Pet Assistant alongside front desk, same as
// HOTEL_ADVANCE_ROLES below - kept as its own name here since it's used on
// routes that aren't part of the check-in/checkout advance flow itself.
const frontDeskAndAssistants = [...HOTEL_ADVANCE_ROLES];

// Issue #75
router.post(
  '/hotel/check-in',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADVANCE_ROLES]),
  requireBranch,
  checkInController
);

router.get(
  '/hotel/pets/:petId/cage-suggestion',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADVANCE_ROLES]),
  requireBranch,
  suggestCageController
);

router.get(
  '/hotel/pets/:petId/current-prescription',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADVANCE_ROLES]),
  requireBranch,
  currentPrescriptionController
);

// Issue #76. Custom change (Boarding Checklist Kanban redesign): widened
// from HOTEL_PET_ASSISTANT_ROLES to HOTEL_ADVANCE_ROLES - the unified Kanban
// (replacing the old admin-only flagged list, see #77 below) now shows
// actionable checkboxes to front-desk/Admin/Supervisor/Superadmin too.
router.patch(
  '/hotel/care-log-entry/:id/complete',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  completeCareLogEntryController
);

// Custom change (Boarding Checklist Kanban)
router.patch(
  '/hotel/care-log-entry/:id/start',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  startCareLogEntryController
);

router.patch(
  '/hotel/care-log-entry/:id/reopen',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  reopenCareLogEntryController
);

// Issue #80 (Boarding Checklist). Custom change (redesign): now accepts an
// optional date_from/date_to range (see careLogEntriesQueryValidator) -
// still defaults to today-only when neither is supplied.
router.get(
  '/hotel/care-log/today',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  careLogEntriesController
);

// Issue #77's admin-only flagged list is retired (Boarding Checklist Kanban
// redesign) - the unified Kanban's Pending/Missed columns, now visible to
// every role via the route above, replace it. See
// careLogFlagging.service.ts's removal in the same change.

// Custom change: Hotel/Daycare activity logbook (#48 follow-up).
router.get(
  '/hotel/activity-log',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole(frontDeskAndAssistants),
  requireBranch,
  activityLogController
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
  requireRole([...HOTEL_ADVANCE_ROLES]),
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

// Custom change (Cage CRUD, Settings > Config)
router.post(
  '/hotel/cages',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  requireBranch,
  createCageController
);

router.patch(
  '/hotel/cage/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  requireBranch,
  updateCageController
);

router.delete(
  '/hotel/cage/:id',
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...HOTEL_ADMIN_ROLES]),
  requireBranch,
  deleteCageController
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
  requireRole([...HOTEL_ADVANCE_ROLES]),
  requireBranch,
  checkoutController
);

// #79's food/medication catalogs moved to features/catalog/ (Sprint 5
// unification, #82) - see catalog.routes.ts's GET/POST/PATCH/DELETE
// /catalog/products.

export default router;
