import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { FrontDeskQueuePage } from './pages/FrontDeskQueuePage/FrontDeskQueuePage';

/** Role enforcement happens inside the page itself (ALLOWED_VIEWER_ROLES),
 * same pattern as staffItems.routes.tsx. */
export const frontDeskRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/front-desk/queue" element={<FrontDeskQueuePage />} />
    </Route>
  </Fragment>
);
