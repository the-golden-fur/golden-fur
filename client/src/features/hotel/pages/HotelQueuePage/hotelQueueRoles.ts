/** Shared between HotelQueuePage and HotelCheckInFormPage - the routed
 * check-in form is reached from HotelQueuePage's picker but is its own
 * route, so it needs the same role gate rather than inheriting one. Kept in
 * its own module (not exported alongside a component) so react-refresh's
 * only-export-components rule doesn't flag either page component's file. */
export const HOTEL_QUEUE_VIEWER_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
  'Groomer',
  'Pet Assistant',
]);
