import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { VeterinaryConsolePage } from './pages/VeterinaryConsolePage/VeterinaryConsolePage';
import { MyPatientsPage } from './pages/MyPatientsPage/MyPatientsPage';
import { VetCatalogPage } from './pages/VetCatalogPage/VetCatalogPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage/PrescriptionsPage';

/** Issue #70: Veterinary Console - Veterinarian/Admin/Supervisor/Superadmin
 * only, enforced inside the page itself (ALLOWED_VIEWER_ROLES), same
 * pattern as GroomerDashboardPage/UnavailabilityApprovalQueuePage.
 * My Patients is a personal roster - Veterinarian only, its own
 * ALLOWED_VIEWER_ROLES inside MyPatientsPage. #117: Prescriptions is
 * staff-facing (every patient), its own ALLOWED_VIEWER_ROLES matching
 * VETERINARY_READ_ROLES. Custom change: the standalone Consultation
 * Results page/route was removed - results are reached from a "Results"
 * row option on the Consultation Queue instead. */
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
      <Route
        path="/staff/veterinary/prescriptions"
        element={<PrescriptionsPage />}
      />
    </Route>
  </Fragment>
);
