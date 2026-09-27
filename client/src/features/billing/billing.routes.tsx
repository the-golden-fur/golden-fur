import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CashierCheckoutPage } from './pages/CashierCheckoutPage/CashierCheckoutPage';
import { MiscSaleManagementPage } from './pages/MiscSaleManagementPage/MiscSaleManagementPage';

/** Sprint 5 Epic A (#86/#87): role enforcement for the cashier-facing pages
 * happens server-side only (every staff role that can reach /staff may
 * checkout or record a misc sale). MiscSaleManagementPage (session 115) is
 * now shared by every BILLING_STAFF_ROLES role, with Edit/Delete gated to
 * Admin/Superadmin inside the page itself - "New Misc Sale" opens as a
 * modal there rather than through a separate route. The checkout route's
 * :bookingId param is optional, mirroring hotel.routes.tsx's own
 * checkout/:stayId precedent - otherwise entered manually on the page. */
export const billingRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/billing/checkout" element={<CashierCheckoutPage />} />
      <Route
        path="/staff/billing/checkout/:bookingId"
        element={<CashierCheckoutPage />}
      />
      <Route
        path="/staff/admin/misc-sales"
        element={<MiscSaleManagementPage />}
      />
    </Route>
  </Fragment>
);
