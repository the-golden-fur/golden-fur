import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { StaffFoodMedicationItemsPage } from './pages/StaffFoodMedicationItemsPage/StaffFoodMedicationItemsPage';

/** Shared staff-owned food/medication item library - role enforcement
 * happens inside the page itself (ALLOWED_VIEWER_ROLES), same pattern as
 * catalog.routes.tsx's ProductCatalogPage. */
export const staffItemsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route
        path="/staff/food-medication-items"
        element={<StaffFoodMedicationItemsPage />}
      />
    </Route>
  </Fragment>
);
