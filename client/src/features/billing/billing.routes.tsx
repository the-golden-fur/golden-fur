import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CashierCheckoutPage } from './pages/CashierCheckoutPage/CashierCheckoutPage';
import { MiscellaneousSalePage } from './pages/MiscellaneousSalePage/MiscellaneousSalePage';
import { MiscSaleManagementPage } from './pages/MiscSaleManagementPage/MiscSaleManagementPage';

/** Sprint 5 Epic A (#86/#87): role enforcement for the cashier-facing pages
 * happens server-side only (every staff role that can reach /staff may
 * checkout or record a misc sale); MiscSaleManagementPage additionally
 * gates client-side to Admin/Superadmin, matching ProductCatalogPage's own
 * pattern. The checkout route's :bookingId param is optional, mirroring
 * hotel.routes.tsx's own checkout/:stayId precedent - otherwise entered
 * manually on the page. */
export const billingRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/billing/checkout" element={<CashierCheckoutPage />} />
      <Route
        path="/staff/billing/checkout/:bookingId"
        element={<CashierCheckoutPage />}
      />
      <Route
        path="/staff/billing/misc-sale"
        element={<MiscellaneousSalePage />}
      />
      <Route
        path="/staff/admin/misc-sales"
        element={<MiscSaleManagementPage />}
      />
    </Route>
  </Fragment>
);
