import { Fragment } from 'react';
import { Route } from 'react-router';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { AssessmentQueuePage } from './pages/AssessmentQueuePage/AssessmentQueuePage';
import { BookingDetailsPage } from './pages/BookingDetailsPage/BookingDetailsPage';
import { CustomerBookingFlowPage } from './pages/CustomerBookingFlowPage/CustomerBookingFlowPage';
import { CustomerBookingsPage } from './pages/CustomerBookingsPage/CustomerBookingsPage';
import { ReceptionistBookingsQueuePage } from './pages/ReceptionistBookingsQueuePage/ReceptionistBookingsQueuePage';
import { PolicyConfigurationPage } from './pages/PolicyConfigurationPage/PolicyConfigurationPage';

/**
 * M03 Booking routes (#55-#60). CustomerBookingFlowPage is mounted at both
 * /portal/book (customer self-service) and /staff/bookings/new
 * (receptionist walk-in/phone-in) - the component itself resolves which
 * variant to render from the route prefix (AC-5: reuses the same shell,
 * not a separate implementation).
 *
 * Custom change (assessment-queue-page): /staff/assessment/queue is the
 * Assessment (formerly Misc) category's own dedicated queue, split out of
 * ReceptionistBookingsQueuePage - same StaffAuthGuard-only wrapper as
 * /staff/bookings/queue, role-gated inside the page itself
 * (ALLOWED_VIEWER_ROLES), same pattern as GroomerDashboardPage.
 */
export const bookingRoutes = (
  <Fragment>
    <Route element={<CustomerAuthGuard />}>
      <Route path="/portal/book" element={<CustomerBookingFlowPage />} />
      <Route path="/portal/bookings" element={<CustomerBookingsPage />} />
    </Route>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/bookings/new" element={<CustomerBookingFlowPage />} />
      <Route
        path="/staff/bookings/queue"
        element={<ReceptionistBookingsQueuePage />}
      />
      <Route path="/staff/assessment/queue" element={<AssessmentQueuePage />} />
      <Route
        path="/staff/bookings/:bookingId"
        element={<BookingDetailsPage />}
      />
      <Route
        path="/staff/admin/maintenance/policies"
        element={<PolicyConfigurationPage />}
      />
    </Route>
  </Fragment>
);
