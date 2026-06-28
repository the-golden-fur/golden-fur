import { Router } from 'express';
import staffAuthRoutes from './staff/staffAuth.routes.ts';
import customerAuthRoutes from './customers/customerAuth.routes.ts';

const router = Router();

router.use('/auth', staffAuthRoutes);
router.use('/auth', customerAuthRoutes);

export default router;
