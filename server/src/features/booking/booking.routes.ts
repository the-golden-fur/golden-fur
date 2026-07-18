import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  availabilityController,
  cancelBookingController,
  catalogController,
  createBookingController,
  getBookingController,
  listBookingsController,
  listPolicyConfigurationsController,
  rescheduleBookingController,
  staffPickerOptionsController,
  updatePolicyConfigurationController,
} from './booking.controller.ts';
import {
  BOOKING_POLICY_READ_ROLES,
  BOOKING_POLICY_WRITE_ROLES,
} from './booking.types.ts';

/**
 * Two access tiers:
 * - customer-or-staff routes (create/read/reschedule/cancel + the Staff
 *   Picker options the customer booking flow needs) use jwtMiddleware only,
 *   with ownership authorization in the services - the pets pattern;
 * - the policy-configuration surface (#52) is staff-only: all-staff read,
 *   Admin/Superadmin write (AC-5), with the usual sessionTimeout chain.
 *
 * Static paths (/bookings/staff-picker, /bookings/policy, /bookings/
 * availability) are registered before /bookings/:id so Express never
 * captures them as an id.
 */
const router = Router();

const staffRead = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BOOKING_POLICY_READ_ROLES]),
];

const adminWrite = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BOOKING_POLICY_WRITE_ROLES]),
];

// Booking creation + capacity enforcement (#51)
router.post('/bookings', jwtMiddleware, createBookingController);

// List: a customer's own bookings, or (staff) a branch queue - supporting
// infra for #59/#60, neither of which had a list endpoint to call against.
router.get('/bookings', jwtMiddleware, listBookingsController);

// Slot-by-slot capacity read - supporting infra for #56's Slot Picker,
// wrapping the same checkCapacity()/get_staff_availability() logic #51/#49
// already run at submission time, read-only and ahead of it.
router.get('/bookings/availability', jwtMiddleware, availabilityController);

// Active services/packages/promos for a branch - supporting infra for #55's
// service-selection step and #58's pricing summary. Epic A's
// /maintenance/* endpoints (and the underlying RLS) are staff-only, so this
// wraps the same maintenance service-layer functions server-side rather
// than exposing them directly to a customer session.
router.get('/bookings/catalog', jwtMiddleware, catalogController);

// Staff Picker resolution (#52)
router.get(
  '/bookings/staff-picker',
  jwtMiddleware,
  staffPickerOptionsController
);

// policy_configurations stub (#52)
router.get('/bookings/policy', staffRead, listPolicyConfigurationsController);
router.patch(
  '/bookings/policy',
  adminWrite,
  updatePolicyConfigurationController
);

router.get('/bookings/:id', jwtMiddleware, getBookingController);

// Reschedule / cancellation (#54)
router.post(
  '/bookings/:id/reschedule',
  jwtMiddleware,
  rescheduleBookingController
);
router.post('/bookings/:id/cancel', jwtMiddleware, cancelBookingController);

export default router;
