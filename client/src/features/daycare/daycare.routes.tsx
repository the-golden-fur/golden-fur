import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { DaycareCheckInPage } from './pages/DaycareCheckInPage/DaycareCheckInPage';
import { DaycareCheckoutPage } from './pages/DaycareCheckoutPage/DaycareCheckoutPage';

/** Issue #69: Daycare check-in/checkout - Receptionist/Admin/Supervisor/
 * Superadmin only, enforced inside each page (ALLOWED_VIEWER_ROLES), same
 * pattern as GroomerDashboardPage/VeterinaryConsolePage. The checkout route's
 * :sessionId param is optional - DaycareCheckInPage's "Go to checkout" link
 * supplies it right after check-in; otherwise it's entered manually (see
 * DaycareCheckoutPage's own scope note on why no "browse active sessions"
 * list exists). */
export const daycareRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/daycare/check-in" element={<DaycareCheckInPage />} />
      <Route path="/staff/daycare/checkout" element={<DaycareCheckoutPage />} />
      <Route
        path="/staff/daycare/checkout/:sessionId"
        element={<DaycareCheckoutPage />}
      />
    </Route>
  </Fragment>
);
