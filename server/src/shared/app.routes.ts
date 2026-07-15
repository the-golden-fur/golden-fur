import { Router } from 'express';
import authRoutes from '../features/auth/auth.routes.ts';
import staffRoutes from '../features/staff/staff.routes.ts';
import customerRoutes from '../features/customers/customer.routes.ts';
import maintenanceRoutes from '../features/maintenance/maintenance.routes.ts';
import discountsRoutes from '../features/discounts/discounts.routes.ts';

const router = Router();

router.use(authRoutes);
router.use(staffRoutes);
router.use(customerRoutes);
router.use(maintenanceRoutes);
router.use(discountsRoutes);

export default router;
