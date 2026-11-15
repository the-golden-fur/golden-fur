/** Mirrors the server's bugReports.types.ts. */
export type BugReportCategory = 'bug' | 'feature_request';
export type BugReportStatus =
  | 'pending'
  | 'in_progress'
  | 'resolved'
  | 'dismissed';

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

export interface CreateBugReportPayload {
  category: BugReportCategory;
  title: string;
  description: string;
}

/** Queue page: Developer or Superadmin only - mirrors the server's
 * BUG_REPORT_MANAGER_ROLES. */
export const BUG_REPORT_MANAGER_ROLES: readonly string[] = [
  'Developer',
  'Superadmin',
];

export const BUG_REPORT_CATEGORY_LABELS: Record<BugReportCategory, string> = {
  bug: 'Bug report',
  feature_request: 'Feature request',
};

export const BUG_REPORT_STATUS_LABELS: Record<BugReportStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};
