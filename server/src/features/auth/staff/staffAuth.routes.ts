import { Router } from 'express';
import { staffLoginController } from './staffAuth.controller.ts';

const router = Router();

router.post('/staff/login', staffLoginController);

export default router;
