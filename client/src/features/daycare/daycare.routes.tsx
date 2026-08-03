import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { DaycareQueuePage } from './pages/DaycareQueuePage/DaycareQueuePage';
import {
  DaycareCheckInRedirect,
  DaycareCheckoutRedirect,
  DaycareCheckoutSessionRedirect,
} from './pages/DaycareQueuePage/DaycareLegacyRedirects';

/**
 * Queue redesign: the former separate Daycare Check-in and Daycare Checkout
 * pages/routes are replaced by one Daycare Queue page with Check In/Check
 * Out tabs (role enforcement happens once inside DaycareQueuePage, instead
 * of once per page - and now also includes Groomer/Pet Assistant, mirrors
 * hotel.routes.tsx). The three old paths redirect into it rather than
 * disappearing outright, so old bookmarks/links keep working.
 */
export const daycareRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/daycare/queue" element={<DaycareQueuePage />} />
      <Route
        path="/staff/daycare/check-in"
        element={<DaycareCheckInRedirect />}
      />
      <Route
        path="/staff/daycare/checkout"
        element={<DaycareCheckoutRedirect />}
      />
      <Route
        path="/staff/daycare/checkout/:sessionId"
        element={<DaycareCheckoutSessionRedirect />}
      />
    </Route>
  </Fragment>
);
