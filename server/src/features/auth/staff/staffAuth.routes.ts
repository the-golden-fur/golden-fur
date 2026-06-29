import { Router } from 'express';
import {
  staffLoginController,
  mfaEnrollController,
  mfaVerifyController,
  forgotPasswordController,
} from './staffAuth.controller.ts';
import { jwtMiddleware } from '../middleware/jwt/jwt.middleware.ts';

const router = Router();

router.post('/staff/login', staffLoginController);
router.post('/staff/mfa/enroll', jwtMiddleware, mfaEnrollController);
router.post('/staff/mfa/verify', jwtMiddleware, mfaVerifyController);
router.post('/staff/forgot-password', forgotPasswordController);

export default router;
