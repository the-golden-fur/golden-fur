import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  archiveFoodItemController,
  archiveMedicationItemController,
  createFoodItemController,
  createMedicationItemController,
  listMineFoodItemsController,
  listMineMedicationItemsController,
  listPickableFoodItemsController,
  listPickableMedicationItemsController,
  updateFoodItemController,
  updateMedicationItemController,
} from './staffItems.controller.ts';
import { STAFF_ITEM_ROLES } from './staffItems.types.ts';

/**
 * Staff-owned food/medication item library - every one of the 7
 * Hotel/Daycare check-in roles may read/write (ownership is enforced
 * per-item server-side, see staffFoodItems.service.ts's
 * assertOwnedOrAdminManageable), so a single role gate covers the whole
 * router, same shape as catalog.routes.ts's staffRead/adminWrite split
 * minus the split (there's no "admin only" route here - every write is
 * ownership/visibility-checked instead).
 */
const router = Router();

const staffAuth = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...STAFF_ITEM_ROLES]),
];

router.get('/staff/food-items/mine', staffAuth, listMineFoodItemsController);
router.get(
  '/staff/food-items/pickable',
  staffAuth,
  listPickableFoodItemsController
);
router.post('/staff/food-items', staffAuth, createFoodItemController);
router.patch('/staff/food-items/:id', staffAuth, updateFoodItemController);
router.delete('/staff/food-items/:id', staffAuth, archiveFoodItemController);

router.get(
  '/staff/medication-items/mine',
  staffAuth,
  listMineMedicationItemsController
);
router.get(
  '/staff/medication-items/pickable',
  staffAuth,
  listPickableMedicationItemsController
);
router.post(
  '/staff/medication-items',
  staffAuth,
  createMedicationItemController
);
router.patch(
  '/staff/medication-items/:id',
  staffAuth,
  updateMedicationItemController
);
router.delete(
  '/staff/medication-items/:id',
  staffAuth,
  archiveMedicationItemController
);

export default router;
