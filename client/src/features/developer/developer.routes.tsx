import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { DeveloperDashboardPage } from './pages/DeveloperDashboardPage/DeveloperDashboardPage';

/** Developer (+ Superadmin) only - role-gated inside the page itself
 * (DEVELOPER_DASHBOARD_ROLES). */
export const developerRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/developer/dashboard"
        element={<DeveloperDashboardPage />}
      />
    </Route>
  </Fragment>
);
