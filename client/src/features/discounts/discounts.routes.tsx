import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { AdminDiscountManagementPage } from './pages/AdminDiscountManagementPage/AdminDiscountManagementPage';

/**
 * Admin discount management route (#48). Same pattern as
 * maintenance.routes.tsx: StaffAuthGuard handles authentication/MFA/
 * session-timeout; the Admin/Superadmin-only gate lives inside the page
 * (viewer role resolved from GET /staff).
 */
export const discountsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/admin/discounts"
        element={<AdminDiscountManagementPage />}
      />
    </Route>
  </Fragment>
);
