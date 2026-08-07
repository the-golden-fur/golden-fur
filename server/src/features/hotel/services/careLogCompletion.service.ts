import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CareLogEntry } from '../hotel.types.ts';
import { sendCareLogCompletedNotification } from './careLogNotifications.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface CompleteParams {
  entryId: string;
  completedByStaffId: string;
}

interface TodayParams {
  branchId: string;
  date: string;
}

/**
 * Backs the pet-assistant-facing daily checklist (#80 AC-1) - every
 * scheduled care action for `date` across active stays at the caller's
 * branch, completed or not (unlike careLogFlagging.service.ts, which only
 * surfaces uncompleted, past-due entries for the supervisor dashboard).
 */
export async function getTodayCareLogEntries({
  branchId,
  date,
}: TodayParams): Promise<CareLogEntry[]> {
  const { data, error } = await supabase
    .from('care_log_entries')
    .select(
      '*, completed_by_staff:staff_profiles(display_name), stays!inner(branch_id, status)'
    )
    .eq('scheduled_date', date)
    .eq('stays.status', 'Active')
    .eq('stays.branch_id', branchId);

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as unknown as CareLogEntry[];
}

/**
 * Issue #76: a dedicated completion path, not a generic row UPDATE - RLS
 * grants Pet Assistant no UPDATE at all on care_log_entries (#74 migration),
 * so this service-role write is the only way an entry is ever marked
 * complete. completed_at is forced to now() and completed_by to the
 * caller's own staff ID - neither is accepted from the request.
 */
export async function completeCareLogEntry({
  entryId,
  completedByStaffId,
}: CompleteParams): Promise<CareLogEntry> {
  const { data: entry, error: fetchError } = await supabase
    .from('care_log_entries')
    .select('*, stays!inner(notify_opt_in, pet_id)')
    .eq('id', entryId)
    .maybeSingle();

  if (fetchError) throwWithStatus(400, fetchError.message);
  if (!entry) throwWithStatus(404, 'Care log entry not found');

  // AC-2: idempotent - a second completion attempt is a clear error, not a
  // second write.
  if (entry.completed_at) {
    throwWithStatus(409, 'This care log entry is already completed');
  }

  const { data: updated, error: updateError } = await supabase
    .from('care_log_entries')
    .update({
      completed_at: new Date().toISOString(),
      completed_by: completedByStaffId,
    })
    .eq('id', entryId)
    .is('completed_at', null)
    .select('*')
    .maybeSingle();

  if (updateError) throwWithStatus(400, updateError.message);
  if (!updated) {
    throwWithStatus(409, 'This care log entry is already completed');
  }

  const stay = (
    entry as unknown as {
      stays: { notify_opt_in: boolean; pet_id: string };
    }
  ).stays;

  if (stay.notify_opt_in) {
    await sendCareLogCompletedNotification(
      updated as CareLogEntry,
      stay.pet_id
    );
  }

  return updated as CareLogEntry;
}
