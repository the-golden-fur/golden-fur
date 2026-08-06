import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  AnalyticsSummary,
  AnalyticsTimeFilter,
} from '../reports.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const VALID_TIME_FILTERS: readonly AnalyticsTimeFilter[] = [
  'today',
  'this_week',
  'this_month',
  'this_year',
  'all_time',
];

interface GetAnalyticsSummaryParams {
  requesterRole: string;
  branchId?: string | null;
  timeFilter: string;
}

/**
 * Issue #103: wraps get_analytics_summary() (migration 20260805101, added
 * alongside #102's two functions in the same file). Superadmin-only
 * restriction enforced here at the application layer - Modules-Features is
 * explicit this dashboard is Superadmin-only, distinct from the DSR which
 * Admin/Supervisor can also see for their own branch - matching the
 * established RLS-plus-application-check "defense in depth" convention even
 * though the route itself also gates on role.
 */
export async function getAnalyticsSummary({
  requesterRole,
  branchId,
  timeFilter,
}: GetAnalyticsSummaryParams): Promise<AnalyticsSummary> {
  if (requesterRole !== 'Superadmin') {
    throwWithStatus(403, 'Only a Superadmin can view the analytics dashboard');
  }

  if (!VALID_TIME_FILTERS.includes(timeFilter as AnalyticsTimeFilter)) {
    throwWithStatus(400, 'Invalid time_filter value');
  }

  const { data, error } = await supabase.rpc('get_analytics_summary', {
    p_branch_id: branchId ?? null,
    p_time_filter: timeFilter,
  });

  if (error) throwWithStatus(400, error.message);

  return data as AnalyticsSummary;
}
