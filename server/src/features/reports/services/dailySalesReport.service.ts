import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { DailySalesReport } from '../reports.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface GetDailySalesReportParams {
  requesterRole: string;
  requesterBranchId: string;
  branchId?: string | null;
  reportDate: string;
}

/**
 * Issue #102: wraps get_daily_sales_report() (migration 20260805101).
 * Branch-scoping enforced here, in addition to whatever the SQL function
 * itself does - Admin/Supervisor are restricted to their own branch
 * regardless of what branchId they pass; only a Superadmin may pass a
 * different branch or omit one entirely (NULL = combined-branches view).
 */
export async function getDailySalesReport({
  requesterRole,
  requesterBranchId,
  branchId,
  reportDate,
}: GetDailySalesReportParams): Promise<DailySalesReport> {
  const effectiveBranchId =
    requesterRole === 'Superadmin' ? (branchId ?? null) : requesterBranchId;

  const { data, error } = await supabase.rpc('get_daily_sales_report', {
    p_branch_id: effectiveBranchId,
    p_report_date: reportDate,
  });

  if (error) throwWithStatus(400, error.message);

  return data as DailySalesReport;
}
