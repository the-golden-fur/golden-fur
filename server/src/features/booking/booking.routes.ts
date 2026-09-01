import { Router } from 'express';
import { jwtMiddleware } from '../../shared/auth/middleware/jwt/jwt.middleware.ts';
import { sessionTimeoutMiddleware } from '../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts';
import { requireRole } from '../auth/staff/middleware/requireRole/requireRole.middleware.ts';
import {
  availabilityController,
  cagePickerOptionsController,
  cancelBookingController,
  catalogController,
  completeBookingController,
  createBookingController,
  downpaymentStatusController,
  getBookingController,
  listBookingsController,
  listPolicyConfigurationsController,
  nextAvailableSlotController,
  onlinePaymentsStatusController,
  overrideBookingStatusController,
  partsOfDayController,
  payBookingController,
  petBookingConflictsController,
  rescheduleBookingController,
  staffPickerOptionsController,
  startBookingController,
  updatePolicyConfigurationController,
} from './booking.controller.ts';
import {
  BOOKING_POLICY_READ_ROLES,
  BOOKING_POLICY_WRITE_ROLES,
  BOOKING_STATUS_ADVANCE_ROLES,
  BOOKING_STATUS_OVERRIDE_ROLES,
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

const statusAdvance = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BOOKING_STATUS_ADVANCE_ROLES]),
];

const statusOverride = [
  jwtMiddleware,
  sessionTimeoutMiddleware,
  requireRole([...BOOKING_STATUS_OVERRIDE_ROLES]),
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

// #22: "fully booked" warning support - the earliest available day/slot
// looking forward from a given date, so the booking flow can warn right
// after service selection instead of only once the customer reaches the
// Slot Picker.
router.get(
  '/bookings/availability/next-slot',
  jwtMiddleware,
  nextAvailableSlotController
);

// #22: which Morning/Afternoon/Evening walk/play blocks a branch's
// operating hours actually permit for a given date - the hotel Care
// Instructions step uses this to hide out-of-hours options.
router.get(
  '/bookings/availability/parts-of-day',
  jwtMiddleware,
  partsOfDayController
);

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

// Cage Picker resolution (Custom change - mirrors Staff Picker)
router.get('/bookings/cage-picker', jwtMiddleware, cagePickerOptionsController);

// Custom change: whether the customer-facing Pay button should be enabled
// for a branch - read by both the customer Bookings page and the Admin
// online-payments toggle's own preview.
router.get(
  '/bookings/online-payments-status',
  jwtMiddleware,
  onlinePaymentsStatusController
);

// Custom change: per-transaction downpayment config for a branch - same
// customer-readable shape as online-payments-status above, read by the
// customer booking flow to preview the amount before submitting.
router.get(
  '/bookings/downpayment-status',
  jwtMiddleware,
  downpaymentStatusController
);

// Custom change: duplicate-booking prevention - pet ids with an unresolved
// Hotel/Daycare booking, read by the booking flow's pet-selection step.
router.get(
  '/bookings/pet-conflicts',
  jwtMiddleware,
  petBookingConflictsController
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

// Customer self-service Pay button (CustomerBookingsPage) - ownership
// checked in payForBooking, same pattern as reschedule/cancel above.
router.post('/bookings/:id/pay', jwtMiddleware, payBookingController);

// Manual status-advance actions (booking-status revision, replacing the
// retired 'Confirmed' payment gate): Start/Complete open to any staff role
// except Cashier. No-show has no route - it's a lazy transition applied on
// read (see booking.service.ts).
router.post('/bookings/:id/start', statusAdvance, startBookingController);
router.post('/bookings/:id/complete', statusAdvance, completeBookingController);

// Admin/Superadmin-only direct status set (forward or backward) - replaces
// their Start/Complete buttons with one status dropdown in the queue.
router.patch(
  '/bookings/:id/status',
  statusOverride,
  overrideBookingStatusController
);

// Payment is recorded per transaction on the Transactions page now
// (POST /billing/transactions/:id/pay etc.) - the old
// /bookings/:id/payment-stage routes are gone with the Payments Queue.

export default router;
