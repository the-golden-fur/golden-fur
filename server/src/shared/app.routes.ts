import { Router } from 'express';
import authRoutes from '../features/auth/auth.routes.ts';
import staffRoutes from '../features/staff/staff.routes.ts';
import customerRoutes from '../features/customers/customer.routes.ts';

const router = Router();

router.use(authRoutes);
router.use(staffRoutes);
router.use(customerRoutes);

export default router;
