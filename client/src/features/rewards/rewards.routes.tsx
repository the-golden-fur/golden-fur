import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { AdminSpinWheelConfigPage } from './pages/AdminSpinWheelConfigPage/AdminSpinWheelConfigPage';
import { CustomerRewardsPage } from './pages/CustomerRewardsPage/CustomerRewardsPage';

/**
 * Coupon spin wheel routes (session 86). Admin/Superadmin-only gate for the
 * config page lives inside the page itself (viewer role resolved from GET
 * /staff), matching AdminPromoConfigPage's own pattern. /portal/rewards is
 * the customer-facing "My Rewards" page, wrapped in CustomerAuthGuard, same
 * split as credits.routes.tsx's /portal/credits.
 */
export const rewardsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/admin/spin-wheel-config"
        element={<AdminSpinWheelConfigPage />}
      />
    </Route>
    <Route element={<CustomerAuthGuard />}>
      <Route path="/portal/rewards" element={<CustomerRewardsPage />} />
    </Route>
  </Fragment>
);
