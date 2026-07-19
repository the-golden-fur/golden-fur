import { Router } from 'express';
import authRoutes from '../features/auth/auth.routes.ts';
import staffRoutes from '../features/staff/staff.routes.ts';
import customerRoutes from '../features/customers/customer.routes.ts';
import maintenanceRoutes from '../features/maintenance/maintenance.routes.ts';
import discountsRoutes from '../features/discounts/discounts.routes.ts';
import bookingRoutes from '../features/booking/booking.routes.ts';
import groomingRoutes from '../features/grooming/grooming.routes.ts';
import daycareRoutes from '../features/daycare/daycare.routes.ts';

const router = Router();

router.use(authRoutes);
router.use(staffRoutes);
router.use(customerRoutes);
router.use(maintenanceRoutes);
router.use(discountsRoutes);
router.use(bookingRoutes);
router.use(groomingRoutes);
router.use(daycareRoutes);

export default router;
