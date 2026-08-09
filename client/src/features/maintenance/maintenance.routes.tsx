import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { AdminServicesAndPackagesPage } from './pages/AdminServicesAndPackagesPage/AdminServicesAndPackagesPage';
import { PricingConfigurationPage } from './pages/PricingConfigurationPage/PricingConfigurationPage';
import { AdminPromoConfigPage } from './pages/AdminPromoConfigPage/AdminPromoConfigPage';
import { AdminBreedsPage } from './pages/AdminBreedsPage/AdminBreedsPage';
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
        path="/staff/admin/maintenance/promos"
        element={<AdminPromoConfigPage />}
      />
      <Route
        path="/staff/admin/maintenance/breeds"
        element={<AdminBreedsPage />}
      />
      <Route
        path="/staff/admin/maintenance/system-configuration"
        element={<SystemConfigurationPage />}
      />
    </Route>
  </Fragment>
);
