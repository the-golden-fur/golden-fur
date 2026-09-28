/** Session 115: every money-handling role can view and record misc sales -
 * matches the server's BILLING_STAFF_ROLES. Shared by the list page and the
 * full-page New Misc Sale form so both gate the same way. */
export const MISC_SALE_VIEWER_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
]);

export const MISC_SALES_PATH = '/staff/admin/misc-sales';
export const NEW_MISC_SALE_PATH = `${MISC_SALES_PATH}/new`;
