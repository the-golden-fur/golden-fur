/** Shared between DaycareQueuePage and DaycareCheckInFormPage - the routed
 * check-in form is reached from a queue row but is its own route, so it
 * needs the same role gate rather than inheriting one. Mirrors
 * hotelQueueRoles.ts. Kept in its own module (not exported alongside a
 * component) so react-refresh's only-export-components rule doesn't flag
 * either page component's file. */
export const DAYCARE_QUEUE_VIEWER_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
  'Groomer',
  'Pet Assistant',
]);
