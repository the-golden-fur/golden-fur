import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { DaycareQueuePage } from './pages/DaycareQueuePage/DaycareQueuePage';
import {
  DaycareCheckInRedirect,
  DaycareCheckoutRedirect,
  DaycareCheckoutSessionRedirect,
} from './pages/DaycareQueuePage/DaycareLegacyRedirects';
import { DaycareCheckInFormPage } from './pages/DaycareCheckInFormPage/DaycareCheckInFormPage';

/**
 * Daycare Queue redesign: the Check In/Check Out tabs are gone - the queue is
 * now a single status-driven list (see DaycareQueuePage's own header
 * comment). A Pending row now routes to its own page
 * (/staff/daycare/queue/check-in/:bookingId) instead of a tab panel;
 * checking in and out both moved off this route entirely (check-in has its
 * own route below, check-out now lives on the shared Boarding Checklist,
 * /staff/hotel/care-log?petId=...). The three old check-in/checkout paths
 * still redirect here rather than disappearing outright, so old bookmarks
 * keep working - they can no longer restore the exact tab/session they used
 * to (that concept doesn't exist anymore), so they just land on the queue.
 */
export const daycareRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/daycare/queue" element={<DaycareQueuePage />} />
      <Route
        path="/staff/daycare/queue/check-in/:bookingId"
        element={<DaycareCheckInFormPage />}
      />
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
