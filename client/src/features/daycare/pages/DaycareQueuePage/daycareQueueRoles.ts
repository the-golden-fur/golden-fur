/** Who can open the Daycare Queue page - the pet-care roles and admins.
 * Same shape as hotelQueueRoles.ts. Kept in its own module (not exported
 * alongside a component) so react-refresh's only-export-components rule
 * doesn't flag either page component's file. */
export const DAYCARE_QUEUE_VIEWER_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
  'Groomer',
  'Pet Assistant',
]);

/** Who can open the routed Daycare check-in form - everyone above, plus
 * Receptionist: the front desk checks its own Daycare bookings in from the
 * Bookings Queue ("Check In" on a Daycare row opens this form), without
 * needing the Daycare Queue page itself. The server's DAYCARE_ADVANCE_ROLES
 * has always allowed the role. */
export const DAYCARE_CHECK_IN_FORM_ROLES = new Set([
  ...DAYCARE_QUEUE_VIEWER_ROLES,
  'Receptionist',
]);
