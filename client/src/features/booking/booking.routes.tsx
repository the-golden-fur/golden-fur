import { Fragment } from 'react';
import { Route } from 'react-router';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CustomerBookingFlowPage } from './pages/CustomerBookingFlowPage/CustomerBookingFlowPage';
import { CustomerBookingsPage } from './pages/CustomerBookingsPage/CustomerBookingsPage';
import { ReceptionistBookingsQueuePage } from './pages/ReceptionistBookingsQueuePage/ReceptionistBookingsQueuePage';

/**
 * M03 Booking routes (#55-#60). CustomerBookingFlowPage is mounted at both
 * /portal/book (customer self-service) and /staff/bookings/new
 * (receptionist walk-in/phone-in) - the component itself resolves which
 * variant to render from the route prefix (AC-5: reuses the same shell,
 * not a separate implementation).
 */
export const bookingRoutes = (
  <Fragment>
    <Route element={<CustomerAuthGuard />}>
      <Route path="/portal/book" element={<CustomerBookingFlowPage />} />
      <Route path="/portal/bookings" element={<CustomerBookingsPage />} />
    </Route>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/bookings/new"
        element={<CustomerBookingFlowPage />}
      />
      <Route
        path="/staff/bookings/queue"
        element={<ReceptionistBookingsQueuePage />}
      />
    </Route>
  </Fragment>
);
