import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { VeterinaryConsolePage } from './pages/VeterinaryConsolePage/VeterinaryConsolePage';
import { MyPatientsPage } from './pages/MyPatientsPage/MyPatientsPage';
import { VetCatalogPage } from './pages/VetCatalogPage/VetCatalogPage';

/** Issue #70: Veterinary Console - Veterinarian/Admin/Supervisor/Superadmin
 * only, enforced inside the page itself (ALLOWED_VIEWER_ROLES), same
 * pattern as GroomerDashboardPage/UnavailabilityApprovalQueuePage.
 * My Patients is a personal roster - Veterinarian only, its own
 * ALLOWED_VIEWER_ROLES inside MyPatientsPage. */
export const veterinaryRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/veterinary/console"
        element={<VeterinaryConsolePage />}
      />
      <Route
        path="/staff/veterinary/my-patients"
        element={<MyPatientsPage />}
      />
      <Route path="/staff/veterinary/catalog" element={<VetCatalogPage />} />
    </Route>
  </Fragment>
);
