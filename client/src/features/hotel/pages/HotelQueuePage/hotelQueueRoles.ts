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

/** Who can open the routed Hotel check-in form - everyone above, plus
 * Receptionist/Front Desk: the front desk checks its own Hotel bookings in
 * from the Bookings Queue ("Check In" on a Hotel row opens this form),
 * without needing the Hotel Queue page itself. The server's
 * HOTEL_ADVANCE_ROLES has always allowed both roles. Mirrors
 * DAYCARE_CHECK_IN_FORM_ROLES. */
export const HOTEL_CHECK_IN_FORM_ROLES = new Set([
  ...HOTEL_QUEUE_VIEWER_ROLES,
  'Receptionist',
  'Front Desk',
]);
