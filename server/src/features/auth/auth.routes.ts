import { Router } from 'express';
import staffAuthRoutes from './staff/staffAuth.routes.ts';

const router = Router();

router.use('/auth', staffAuthRoutes);

export default router;
