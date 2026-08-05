import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CreditManagementPage } from './pages/CreditManagementPage/CreditManagementPage';

/** Issue #95: role enforcement happens client-side inside the page itself
 * (Cashier/Admin/Superadmin), matching MiscSaleManagementPage's own
 * pattern - the route only needs the general StaffAuthGuard. */
export const creditsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/credits" element={<CreditManagementPage />} />
    </Route>
  </Fragment>
);
