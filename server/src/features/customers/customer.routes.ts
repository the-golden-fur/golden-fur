import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import {
  getCustomerProfileController,
  listCustomersController,
  updateCustomerProfileController,
} from './customer.controller.ts';
import petRoutes from './pets/pet.routes.ts';

const router = Router();

router.get('/customers', jwtMiddleware, listCustomersController);
router.get('/customers/:id', jwtMiddleware, getCustomerProfileController);
router.patch('/customers/:id', jwtMiddleware, updateCustomerProfileController);

router.use(petRoutes);

export default router;
