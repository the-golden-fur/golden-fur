import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CareLogEntry } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface FlaggedParams {
  branchId: string | null;
  today: string;
}

/**
 * Issue #77: "flagged" is a read/query concern, not a persisted column
 * (#77 dev notes) - scheduled_date <= today AND completed_at IS NULL,
 * scoped to active stays only. A late completion after this was called
 * simply stops matching on the next call; nothing needs to be kept in
 * sync. branchId null means Superadmin's cross-branch view (#77 AC-2);
 * `today` is the caller's branch-local calendar date, matching the
 * per-branch-operating-hours framing in the Guide's dev notes without
 * needing a real background scheduler, since nothing here is ever written.
 */
export async function getFlaggedCareLogEntries({
  branchId,
  today,
}: FlaggedParams): Promise<CareLogEntry[]> {
  let query = supabase
    .from('care_log_entries')
    .select('*, hotel_stays!inner(status, cage_id, cages!inner(branch_id))')
    .lte('scheduled_date', today)
    .is('completed_at', null)
    .eq('hotel_stays.status', 'Active');

  if (branchId) {
    query = query.eq('hotel_stays.cages.branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as unknown as CareLogEntry[];
}
