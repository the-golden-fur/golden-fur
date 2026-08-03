import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { HotelQueuePage } from './pages/HotelQueuePage/HotelQueuePage';
import {
  HotelCheckInRedirect,
  HotelCheckoutRedirect,
  HotelCheckoutStayRedirect,
} from './pages/HotelQueuePage/HotelLegacyRedirects';
import { HotelCareLogPage } from './pages/HotelCareLogPage/HotelCareLogPage';

/**
 * Queue redesign: the former separate Hotel Check-in and Hotel Checkout
 * pages/routes are replaced by one Hotel Queue page with Check In/Check Out
 * tabs (role enforcement happens once inside HotelQueuePage, instead of
 * once per page). The three old paths redirect into it rather than
 * disappearing outright, so HotelBookingPicker's own "already checked in ->
 * go to checkout" link and any old bookmarks keep working.
 */
export const hotelRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/hotel/queue" element={<HotelQueuePage />} />
      <Route
        path="/staff/hotel/check-in"
        element={<HotelCheckInRedirect />}
      />
      <Route
        path="/staff/hotel/checkout"
        element={<HotelCheckoutRedirect />}
      />
      <Route
        path="/staff/hotel/checkout/:stayId"
        element={<HotelCheckoutStayRedirect />}
      />
      <Route path="/staff/hotel/care-log" element={<HotelCareLogPage />} />
    </Route>
  </Fragment>
);
