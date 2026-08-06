import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import {
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from './notifications.controller.ts';

/**
 * Issues #97/#100/#101: customer-or-staff routes, jwtMiddleware only -
 * ownership is resolved in the controller (staff vs. customer inbox),
 * mirroring booking.routes.ts's own create/read/reschedule/cancel routes.
 * read-all is registered before /:id/read so Express never captures
 * "read-all" as an :id.
 */
const router = Router();

router.get('/notifications', jwtMiddleware, listNotificationsController);
router.patch(
  '/notifications/read-all',
  jwtMiddleware,
  markAllNotificationsReadController
);
router.patch(
  '/notifications/:id/read',
  jwtMiddleware,
  markNotificationReadController
);

export default router;
