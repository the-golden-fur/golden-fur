import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { CreditManagementPage } from './pages/CreditManagementPage/CreditManagementPage';
import { CustomerCreditsPage } from './pages/CustomerCreditsPage/CustomerCreditsPage';

/** Issue #95: role enforcement for the staff page happens client-side inside
 * the page itself (Cashier/Admin/Superadmin), matching
 * MiscSaleManagementPage's own pattern - the route only needs the general
 * StaffAuthGuard.
 *
 * /portal/credits is the customer-facing counterpart (per-branch balance +
 * expiry schedule), wrapped in CustomerAuthGuard - it reads the same
 * customer-scoped GET /credits/* endpoints, same split as
 * reports.routes.tsx's /portal/transactions. */
export const creditsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/credits" element={<CreditManagementPage />} />
    </Route>
    <Route element={<CustomerAuthGuard />}>
      <Route path="/portal/credits" element={<CustomerCreditsPage />} />
    </Route>
  </Fragment>
);
