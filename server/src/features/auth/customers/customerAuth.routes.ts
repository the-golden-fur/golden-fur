import { Router } from 'express';
import {
  customerSignupController,
  customerLoginController,
  customerMfaEnrollController,
  customerMfaVerifyController,
  customerOauthCallbackController,
} from './customerAuth.controller.ts';
import { jwtMiddleware } from '../../../shared/auth/middleware/jwt/jwt.middleware.ts';

const router = Router();

router.post('/customers/signup', customerSignupController);
router.post('/customers/login', customerLoginController);
router.post(
  '/customers/mfa/enroll',
  jwtMiddleware,
  customerMfaEnrollController
);
router.post(
  '/customers/mfa/verify',
  jwtMiddleware,
  customerMfaVerifyController
);
router.post('/customers/oauth/callback', customerOauthCallbackController);

export default router;
