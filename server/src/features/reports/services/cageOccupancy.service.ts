import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CageOccupancyRow } from '../reports.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface GetCageOccupancyReportParams {
  requesterRole: string;
  requesterBranchId: string;
  branchId?: string | null;
}

/**
 * Issue #102: wraps get_cage_occupancy_report() (migration 20260805101) -
 * same branch-scoping convention as dailySalesReport.service.ts.
 */
export async function getCageOccupancyReport({
  requesterRole,
  requesterBranchId,
  branchId,
}: GetCageOccupancyReportParams): Promise<CageOccupancyRow[]> {
  const effectiveBranchId =
    requesterRole === 'Superadmin' ? (branchId ?? null) : requesterBranchId;

  const { data, error } = await supabase.rpc('get_cage_occupancy_report', {
    p_branch_id: effectiveBranchId,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as CageOccupancyRow[];
}
