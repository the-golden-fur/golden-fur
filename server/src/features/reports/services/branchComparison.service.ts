import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  AnalyticsTimeFilter,
  BranchComparisonRow,
} from '../reports.types.ts';
import { VALID_TIME_FILTERS } from './analytics.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface GetBranchComparisonParams {
  requesterRole: string;
  timeFilter: string;
}

/**
 * Custom change (Branch Comparison page): wraps get_branch_comparison()
 * (migration 20261002240). Superadmin-only, re-checked here on top of the
 * route's requireRole - same defense-in-depth convention as
 * getAnalyticsSummary, since this exposes every branch's figures at once.
 */
export async function getBranchComparison({
  requesterRole,
  timeFilter,
}: GetBranchComparisonParams): Promise<BranchComparisonRow[]> {
  if (requesterRole !== 'Superadmin') {
    throwWithStatus(403, 'Only a Superadmin can compare branches');
  }

  if (!VALID_TIME_FILTERS.includes(timeFilter as AnalyticsTimeFilter)) {
    throwWithStatus(400, 'Invalid time_filter value');
  }

  const { data, error } = await supabase.rpc('get_branch_comparison', {
    p_time_filter: timeFilter,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as BranchComparisonRow[];
}
