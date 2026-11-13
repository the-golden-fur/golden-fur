/** Mirrors the bug_report_category/bug_report_status enums (migration
 * 20261102003). */
export type BugReportCategory = 'bug' | 'feature_request';
export type BugReportStatus =
  | 'pending'
  | 'in_progress'
  | 'resolved'
  | 'dismissed';

/** A bug report / feature request submitted from the mascot widget by a
 * customer or a staff member - exactly one of reporter_customer_id/
 * reporter_staff_id is set. */
export interface BugReport {
  id: string;
  reporter_customer_id: string | null;
  reporter_staff_id: string | null;
  category: BugReportCategory;
  title: string;
  description: string;
  status: BugReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Queue page + stats page: a Developer or Superadmin only. Minimal/isolated
 * role - Developer sees nothing else a staff member can normally reach. */
export const BUG_REPORT_MANAGER_ROLES: readonly string[] = [
  'Developer',
  'Superadmin',
];
