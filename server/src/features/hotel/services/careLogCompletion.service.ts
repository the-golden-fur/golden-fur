import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CareLogEntry } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * M11's notifications table is Sprint 6 scope, so care_log_completed is a
 * stub/log call, mirroring booking.service.ts's sendBookingConfirmedNotificationStub.
 * TODO(Sprint 6, M11): replace with the real notification dispatch.
 */
function fireCareLogCompletedEvent(entry: CareLogEntry): void {
  // eslint-disable-next-line no-console
  console.info(
    `[M11 stub] care_log_completed notification for hotel stay ${entry.hotel_stay_id}: ${entry.description}`
  );
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
      '*, completed_by_staff:staff_profiles(display_name), hotel_stays!inner(status, cage_id, cages!inner(branch_id))'
    )
    .eq('scheduled_date', date)
    .eq('hotel_stays.status', 'Active')
    .eq('hotel_stays.cages.branch_id', branchId);

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
    .select('*, hotel_stays!inner(notify_opt_in)')
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

  const notifyOptIn = (
    entry as unknown as { hotel_stays: { notify_opt_in: boolean } }
  ).hotel_stays.notify_opt_in;

  if (notifyOptIn) {
    fireCareLogCompletedEvent(updated as CareLogEntry);
  }

  return updated as CareLogEntry;
}
