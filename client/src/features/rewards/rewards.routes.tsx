import { Fragment } from 'react';
import { Navigate, Route } from 'react-router';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { CustomerRewardsPage } from './pages/CustomerRewardsPage/CustomerRewardsPage';
import { FeatureGate } from '../../shared/components/FeatureGate/FeatureGate';

/**
 * Coupon spin wheel routes (session 86). /portal/rewards is the
 * customer-facing "My Rewards" page, wrapped in CustomerAuthGuard, same
 * split as credits.routes.tsx's /portal/credits.
 *
 * The admin side has no standalone route here: it lives inside
 * AdminPromosAndRewardsPage (registered in maintenance.routes.tsx as
 * /staff/admin/maintenance/promos-and-rewards) as the Rewards and Reward
 * Pools tabs, with spin-wheel promos themselves on the Promos tab
 * (session 114). The old config path redirects there for anyone with a
 * bookmarked/linked URL.
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
      {/* Experimental (Settings > Experimental): off -> back to the portal. */}
      <Route
        path="/portal/rewards"
        element={
          <FeatureGate feature="spin_wheel" redirectTo="/portal">
            <CustomerRewardsPage />
          </FeatureGate>
        }
      />
    </Route>
  </Fragment>
);
