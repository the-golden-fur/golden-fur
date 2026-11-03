import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { BugReportsQueuePage } from './pages/BugReportsQueuePage/BugReportsQueuePage';

/** Developer (+ Superadmin) only - role-gated inside the page itself
 * (BUG_REPORT_MANAGER_ROLES), same pattern as every other staff queue
 * page. */
export const bugReportsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/developer/bug-reports"
        element={<BugReportsQueuePage />}
      />
    </Route>
  </Fragment>
);
