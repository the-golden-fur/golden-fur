import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { DeveloperStats } from '../developer.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** The Developer Dashboard's stat cards - total/deactivated customers and
 * staff, plus how many bug reports still need attention. */
export async function getDeveloperStats(): Promise<DeveloperStats> {
  const [
    totalCustomers,
    deactivatedCustomers,
    totalStaff,
    deactivatedStaff,
    pendingBugReports,
  ] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('customer_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false),
    supabase
      .from('staff_profiles')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('staff_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false),
    supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  for (const result of [
    totalCustomers,
    deactivatedCustomers,
    totalStaff,
    deactivatedStaff,
    pendingBugReports,
  ]) {
    if (result.error) throwWithStatus(400, result.error.message);
  }

  return {
    total_customers: totalCustomers.count ?? 0,
    deactivated_customers: deactivatedCustomers.count ?? 0,
    total_staff: totalStaff.count ?? 0,
    deactivated_staff: deactivatedStaff.count ?? 0,
    pending_bug_reports: pendingBugReports.count ?? 0,
  };
}
