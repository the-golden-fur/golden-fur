import { Router } from 'express';
import {
  customerSignupController,
  customerLoginController,
  customerOauthCallbackController,
} from './customerAuth.controller.ts';

const router = Router();

router.post('/customers/signup', customerSignupController);
router.post('/customers/login', customerLoginController);
router.post('/customers/oauth/callback', customerOauthCallbackController);

export default router;
