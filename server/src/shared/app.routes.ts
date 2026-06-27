import { Router } from 'express';
import authRoutes from '../features/auth/auth.routes.ts';

const router = Router();

router.use(authRoutes);

export default router;
