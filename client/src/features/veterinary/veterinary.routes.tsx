import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { VeterinaryConsolePage } from './pages/VeterinaryConsolePage/VeterinaryConsolePage';

/** Issue #70: Veterinary Console - Veterinarian/Admin/Supervisor/Superadmin
 * only, enforced inside the page itself (ALLOWED_VIEWER_ROLES), same
 * pattern as GroomerDashboardPage/UnavailabilityApprovalQueuePage. */
export const veterinaryRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/veterinary/console"
        element={<VeterinaryConsolePage />}
      />
    </Route>
  </Fragment>
);
