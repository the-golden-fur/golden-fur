import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { notifyStaffRole } from '../../notifications/services/notification.service.ts';
import type { BugReport, BugReportStatus } from '../bugReports.types.ts';
import type { CreateBugReportInput } from '../modules/validators/bugReports.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface CreateBugReportParams extends CreateBugReportInput {
  requesterId: string;
}

const CATEGORY_LABEL: Record<CreateBugReportInput['category'], string> = {
  bug: 'Bug report',
  feature_request: 'Feature request',
};

/**
 * Submitted from the mascot widget's "Report a bug / feature request"
 * option, by either a customer or a staff member. Which reporter column to
 * set is resolved with an actual staff_profiles lookup (getStaffRoleOrNull),
 * not the requester's JWT `role` claim - every Supabase Auth token (customer
 * or staff) carries a truthy top-level `role` ("authenticated", for RLS),
 * unrelated to this app's own staff role, so that claim can't tell the two
 * apart. Same pattern booking.service.ts already uses for its own
 * customer-or-staff routes. Notifies every Developer in-app (notifyStaffRole
 * - Developer has no real branch affiliation, so this reaches all of them
 * regardless of branch, not just one).
 */
export async function createBugReport(
  params: CreateBugReportParams
): Promise<BugReport> {
  const { requesterId, category, title, description } = params;

  const staffRole = await getStaffRoleOrNull(requesterId);

  const { data, error } = await supabase
    .from('bug_reports')
    .insert({
      reporter_customer_id: staffRole ? null : requesterId,
      reporter_staff_id: staffRole ? requesterId : null,
      category,
      title,
      description,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to submit the report');
  }

  await notifyStaffRole({
    role: 'Developer',
    eventType: 'bug_report_submitted',
    title: `${CATEGORY_LABEL[category]} submitted`,
    message: title,
  });

  return data as BugReport;
}

/** Every bug report, oldest first - same FIFO-queue convention as
 * creditReview.service.ts's listPendingCreditReviews. */
export async function listBugReports(): Promise<BugReport[]> {
  const { data, error } = await supabase
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as BugReport[];
}

interface UpdateBugReportStatusParams {
  requesterId: string;
  reportId: string;
  status: BugReportStatus;
}

/** A Developer/Superadmin moving a report through its lifecycle - unlike
 * Credit Review's one-shot approve/deny, a report's status can be changed
 * repeatedly (e.g. reopened), so there is no "already decided" guard. */
export async function updateBugReportStatus({
  requesterId,
  reportId,
  status,
}: UpdateBugReportStatusParams): Promise<BugReport> {
  const { data, error } = await supabase
    .from('bug_reports')
    .update({
      status,
      reviewed_by: requesterId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Bug report not found');

  return data as BugReport;
}
