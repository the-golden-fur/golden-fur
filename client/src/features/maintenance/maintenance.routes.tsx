import { Fragment } from 'react';
import { Navigate, Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { AdminServicesAndPackagesPage } from './pages/AdminServicesAndPackagesPage/AdminServicesAndPackagesPage';
import { PricingConfigurationPage } from './pages/PricingConfigurationPage/PricingConfigurationPage';
import { WeightClassConfigurationPage } from './pages/WeightClassConfigurationPage/WeightClassConfigurationPage';
import { AdminPromosAndRewardsPage } from './pages/AdminPromosAndRewardsPage/AdminPromosAndRewardsPage';
import { AdminBreedsPage } from './pages/AdminBreedsPage/AdminBreedsPage';
import { AdminPetTypesPage } from './pages/AdminPetTypesPage/AdminPetTypesPage';
import { SystemConfigurationPage } from './pages/SystemConfigurationPage/SystemConfigurationPage';

/**
 * Admin maintenance panel routes (#45-#47). StaffAuthGuard handles
 * authentication/MFA/session-timeout; the Admin/Superadmin-only gate lives
 * inside each page (viewer role resolved from GET /staff), matching the
 * AdminStaffListPage/AdminCustomerListPage pattern.
 */
export const maintenanceRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/admin/maintenance/services-and-packages"
        element={<AdminServicesAndPackagesPage />}
      />
      <Route
        path="/staff/admin/maintenance/pricing-configuration"
        element={<PricingConfigurationPage />}
      />
      <Route
        path="/staff/admin/maintenance/weight-classes"
        element={<WeightClassConfigurationPage />}
      />
      <Route
        path="/staff/admin/maintenance/promos-and-rewards"
        element={<AdminPromosAndRewardsPage />}
      />
      {/* Promos + Coupon Spin Wheel merge (session 87) - old bookmarked/
          linked paths still resolve, just onto the merged page. */}
      <Route
        path="/staff/admin/maintenance/promos"
        element={<Navigate to="/staff/admin/maintenance/promos-and-rewards" replace />}
      />
      <Route
        path="/staff/admin/maintenance/breeds"
        element={<AdminBreedsPage />}
      />
      <Route
        path="/staff/admin/maintenance/pet-types"
        element={<AdminPetTypesPage />}
      />
      <Route
        path="/staff/admin/maintenance/system-configuration"
        element={<SystemConfigurationPage />}
      />
    </Route>
  </Fragment>
);
