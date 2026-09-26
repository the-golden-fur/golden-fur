import { Router } from 'express';
import multer from 'multer';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import {
  activateCustomerController,
  archiveCustomerController,
  deactivateCustomerController,
  deleteOwnAccountController,
  getCustomerProfileController,
  handleAvatarUploadError,
  hardDeleteCustomerController,
  listArchivedCustomersController,
  listCustomersController,
  restoreCustomerController,
  updateCustomerProfileController,
  uploadCustomerAvatarController,
} from './customer.controller.ts';
import petRoutes from './pets/pet.routes.ts';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/customers', jwtMiddleware, listCustomersController);
router.get(
  '/customers/archived',
  jwtMiddleware,
  listArchivedCustomersController
);
router.get('/customers/:id', jwtMiddleware, getCustomerProfileController);
router.patch('/customers/:id', jwtMiddleware, updateCustomerProfileController);
router.post(
  '/customers/:id/avatar',
  jwtMiddleware,
  avatarUpload.single('avatar'),
  handleAvatarUploadError,
  uploadCustomerAvatarController
);
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
router.delete('/customers/:id/self', jwtMiddleware, deleteOwnAccountController);
router.delete('/customers/:id', jwtMiddleware, hardDeleteCustomerController);

router.use(petRoutes);

export default router;
