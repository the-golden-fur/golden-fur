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
 * Backs the Boarding Checklist (#80 AC-1, renamed/merged from the old Hotel
 * Care Log) - every scheduled care action for `date` across active Hotel
 * AND Daycare stays at the caller's branch, completed or not (unlike
 * careLogFlagging.service.ts, which only surfaces uncompleted, past-due
 * entries for the supervisor dashboard). stay_type/pet_id are pulled
 * through the join so the client can split into Hotel/Daycare subtabs and
 * show the pet's name without a second round-trip per entry.
 */
export async function getTodayCareLogEntries({
  branchId,
  date,
}: TodayParams): Promise<CareLogEntry[]> {
  const { data, error } = await supabase
    .from('care_log_entries')
    .select(
      '*, completed_by_staff:staff_profiles(display_name), stays!inner(branch_id, status, stay_type, pet_id)'
    )
    .eq('scheduled_date', date)
    .eq('stays.status', 'Active')
    .eq('stays.branch_id', branchId);

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as unknown as CareLogEntry[];
}

interface StartParams {
  entryId: string;
}

/**
 * Custom change (Boarding Checklist Kanban): Pending -> In Progress. No
 * staff-id/timestamp tracked for this transition (unlike completion) - the
 * status column alone is enough to drive the Kanban board's middle column,
 * and the completion path already records who/when for the terminal state.
 */
export async function startCareLogEntry({
  entryId,
}: StartParams): Promise<CareLogEntry> {
  const { data, error } = await supabase
    .from('care_log_entries')
    .update({ status: 'In Progress' })
    .eq('id', entryId)
    .eq('status', 'Pending')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) {
    throwWithStatus(409, 'This care log entry is not Pending');
  }

  return data as CareLogEntry;
}

/**
 * Custom change (Boarding Checklist Kanban): reopens a task back to
 * Pending - covers both the checkbox's "uncheck a completed task" affordance
 * and an explicit "back to Pending" action from In Progress. Clears
 * completed_at/completed_by so a reopened task doesn't keep a stale
 * completion record.
 */
export async function reopenCareLogEntry({
  entryId,
}: StartParams): Promise<CareLogEntry> {
  const { data, error } = await supabase
    .from('care_log_entries')
    .update({ status: 'Pending', completed_at: null, completed_by: null })
    .eq('id', entryId)
    .neq('status', 'Pending')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) {
    throwWithStatus(409, 'This care log entry is already Pending');
  }

  return data as CareLogEntry;
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
    .select('*, stays!inner(pet_id)')
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
      status: 'Completed',
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
      stays: { pet_id: string };
    }
  ).stays;

  // Staff no longer gate this per stay (see HotelCheckInPanel - the
  // "Owner opted in" checkbox was removed) - the customer's own
  // notification_preferences['care_log_completed'] is now the sole gate,
  // enforced downstream inside sendCareLogCompletedNotification/
  // createNotification.
  await sendCareLogCompletedNotification(updated as CareLogEntry, stay.pet_id);

  return updated as CareLogEntry;
}
