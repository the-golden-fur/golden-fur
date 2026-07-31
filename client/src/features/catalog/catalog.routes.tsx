import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { ProductCatalogPage } from './pages/ProductCatalogPage/ProductCatalogPage';

/** Sprint 5 unification (#82): replaces hotel.routes.tsx's
 * /staff/hotel/food-catalog and /staff/hotel/medication-catalog with one
 * admin-config entry point - role enforcement happens inside the page
 * itself (ALLOWED_VIEWER_ROLES), same pattern as every other admin page. */
export const catalogRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/admin/product-catalog"
        element={<ProductCatalogPage />}
      />
    </Route>
  </Fragment>
);
