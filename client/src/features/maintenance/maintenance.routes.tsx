import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { AdminServicesPage } from './pages/AdminServicesPage/AdminServicesPage';
import { PricingConfigurationPage } from './pages/PricingConfigurationPage/PricingConfigurationPage';
import { AdminPackageBuilderPage } from './pages/AdminPackageBuilderPage/AdminPackageBuilderPage';
import { AdminPromoConfigPage } from './pages/AdminPromoConfigPage/AdminPromoConfigPage';
import { PromoCapConfigurationPage } from './pages/PromoCapConfigurationPage/PromoCapConfigurationPage';
import { AdminBreedsPage } from './pages/AdminBreedsPage/AdminBreedsPage';

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
        path="/staff/admin/maintenance/services"
        element={<AdminServicesPage />}
      />
      <Route
        path="/staff/admin/maintenance/pricing-configuration"
        element={<PricingConfigurationPage />}
      />
      <Route
        path="/staff/admin/maintenance/packages"
        element={<AdminPackageBuilderPage />}
      />
      <Route
        path="/staff/admin/maintenance/promos"
        element={<AdminPromoConfigPage />}
      />
      <Route
        path="/staff/admin/maintenance/promo-cap-configuration"
        element={<PromoCapConfigurationPage />}
      />
      <Route
        path="/staff/admin/maintenance/breeds"
        element={<AdminBreedsPage />}
      />
    </Route>
  </Fragment>
);
