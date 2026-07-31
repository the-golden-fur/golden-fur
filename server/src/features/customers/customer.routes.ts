import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import {
  activateCustomerController,
  archiveCustomerController,
  deactivateCustomerController,
  getCustomerProfileController,
  hardDeleteCustomerController,
  listArchivedCustomersController,
  listCustomersController,
  restoreCustomerController,
  updateCustomerProfileController,
} from './customer.controller.ts';
import petRoutes from './pets/pet.routes.ts';

const router = Router();

router.get('/customers', jwtMiddleware, listCustomersController);
router.get(
  '/customers/archived',
  jwtMiddleware,
  listArchivedCustomersController
);
router.get('/customers/:id', jwtMiddleware, getCustomerProfileController);
router.patch('/customers/:id', jwtMiddleware, updateCustomerProfileController);
router.patch(
  '/customers/:id/deactivate',
  jwtMiddleware,
  deactivateCustomerController
);
router.patch(
  '/customers/:id/activate',
  jwtMiddleware,
  activateCustomerController
);
router.post('/customers/:id/archive', jwtMiddleware, archiveCustomerController);
router.post('/customers/:id/restore', jwtMiddleware, restoreCustomerController);
router.delete('/customers/:id', jwtMiddleware, hardDeleteCustomerController);

router.use(petRoutes);

export default router;
