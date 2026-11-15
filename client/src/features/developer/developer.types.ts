/** Mirrors the server's developer.types.ts. */
export interface DeveloperStats {
  total_customers: number;
  deactivated_customers: number;
  total_staff: number;
  deactivated_staff: number;
  pending_bug_reports: number;
}

/** Developer Dashboard: Developer or Superadmin only - mirrors the
 * server's BUG_REPORT_MANAGER_ROLES (the same role gate backs both the
 * bug reports queue and this stats page). */
export const DEVELOPER_DASHBOARD_ROLES: readonly string[] = [
  'Developer',
  'Superadmin',
];
