import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { GroomerDashboardPage } from './pages/GroomerDashboardPage/GroomerDashboardPage';

/** Issue #68: Groomer Dashboard - Groomer/Admin/Supervisor/Superadmin only,
 * enforced inside the page itself (ALLOWED_VIEWER_ROLES), same pattern as
 * UnavailabilityApprovalQueuePage. */
export const groomingRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/grooming/queue" element={<GroomerDashboardPage />} />
    </Route>
  </Fragment>
);
