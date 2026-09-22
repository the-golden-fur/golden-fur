import { Fragment } from 'react';
import { Navigate, Route } from 'react-router';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { CustomerRewardsPage } from './pages/CustomerRewardsPage/CustomerRewardsPage';

/**
 * Coupon spin wheel routes (session 86). /portal/rewards is the
 * customer-facing "My Rewards" page, wrapped in CustomerAuthGuard, same
 * split as credits.routes.tsx's /portal/credits.
 *
 * The admin config page (AdminSpinWheelConfigPage) no longer has its own
 * standalone route here (session 87) - it moved inside
 * AdminPromosAndRewardsPage, registered in maintenance.routes.tsx as
 * /staff/admin/maintenance/promos-and-rewards. The old path redirects
 * there for anyone with a bookmarked/linked URL.
 */
export const rewardsRoutes = (
  <Fragment>
    <Route
      path="/staff/admin/spin-wheel-config"
      element={
        <Navigate to="/staff/admin/maintenance/promos-and-rewards" replace />
      }
    />
    <Route element={<CustomerAuthGuard />}>
      <Route path="/portal/rewards" element={<CustomerRewardsPage />} />
    </Route>
  </Fragment>
);
