import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { HotelCheckInPage } from './pages/HotelCheckInPage/HotelCheckInPage';
import { HotelCheckoutPage } from './pages/HotelCheckoutPage/HotelCheckoutPage';
import { HotelCareLogPage } from './pages/HotelCareLogPage/HotelCareLogPage';

/** Sprint 4 Epic A (#79/#80/#81): role enforcement happens inside each page
 * (ALLOWED_VIEWER_ROLES), same pattern as DaycareCheckInPage/
 * DaycareCheckoutPage. The checkout route's :stayId param is optional -
 * HotelCheckInPage's "Go to checkout" link supplies it right after
 * check-in; otherwise it's entered manually, mirroring
 * daycare.routes.tsx's own scope note. */
export const hotelRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/hotel/check-in" element={<HotelCheckInPage />} />
      <Route path="/staff/hotel/checkout" element={<HotelCheckoutPage />} />
      <Route
        path="/staff/hotel/checkout/:stayId"
        element={<HotelCheckoutPage />}
      />
      <Route path="/staff/hotel/care-log" element={<HotelCareLogPage />} />
    </Route>
  </Fragment>
);
