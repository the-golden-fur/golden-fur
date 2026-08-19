import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CareLogEntry } from '../hotel.types.ts';
import { sendCareLogCompletedNotification } from './careLogNotifications.service.ts';
import { recordActivity, recordBulkActivity } from './activityLog.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Custom change (Boarding Checklist Kanban interaction fixes): every
 * mutation below now returns this same joined shape getCareLogEntries uses,
 * not a bare `select('*')` - the client's Kanban board filters cards by
 * `stays.stay_type`/`pet_id`, so a mutation response missing that join used
 * to make the card vanish from view (it failed the Hotel/Daycare filter)
 * instead of visibly moving to its new column. */
const CARE_LOG_ENTRY_SELECT =
  '*, completed_by_staff:staff_profiles(display_name), stays!inner(branch_id, status, stay_type, pet_id)';

interface CompleteParams {
  entryId: string;
  completedByStaffId: string;
}

interface ListParams {
  branchId: string;
  /** YYYY-MM-DD, inclusive. Omitted = unbounded on that side. */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Boarding Checklist Kanban redesign: Missed is a lazy, read-time
 * transition - no cron/scheduled-job infra exists in this app, same as
 * bookings.status='No-show' (booking.service.ts's applyNoShowTransition,
 * which this mirrors). Any Pending/In Progress entry whose scheduled_date
 * is strictly before today is flipped to Missed the moment it's next read.
 * A single bulk update covers every stale row in the result set, not one
 * query per row.
 */
async function applyMissedTransition(
  entries: CareLogEntry[]
): Promise<CareLogEntry[]> {
  const today = new Date().toISOString().slice(0, 10);

  const staleIds = entries
    .filter(
      (entry) =>
        (entry.status === 'Pending' || entry.status === 'In Progress') &&
        entry.scheduled_date < today
    )
    .map((entry) => entry.id);

  if (staleIds.length === 0) return entries;

  const { data, error } = await supabase
    .from('care_log_entries')
    .update({ status: 'Missed' })
    .in('id', staleIds)
    .select('*');

  if (error) throwWithStatus(400, error.message);

  const updatedById = new Map(
    ((data ?? []) as CareLogEntry[]).map((row) => [row.id, row])
  );

  // Custom change (activity logbook): one batched insert covering every row
  // this call flipped, not one insert per row - `entries` (the pre-flip
  // list, still carrying the `stays` join) is what has branch_id/stay_id
  // available, not the bulk update's own bare `select('*')` response. Both
  // callers (getCareLogEntries, assertChecklistComplete) join stays(branch_id)
  // so this should never actually filter anything out - the fallback is
  // just defense against this function ever being called with an unjoined
  // row in the future, since a missing branch_id can't be logged.
  await recordBulkActivity(
    entries
      .filter((entry) => updatedById.has(entry.id) && entry.stays?.branch_id)
      .map((entry) => ({
        branchId: entry.stays!.branch_id,
        stayId: entry.stay_id,
        careLogEntryId: entry.id,
        action: 'task_missed',
        description: `Missed: ${entry.description}`,
      }))
  );

  return entries.map((entry) => {
    const updated = updatedById.get(entry.id);
    // The bulk update's own `select('*')` doesn't carry the join columns
    // (completed_by_staff/stays) the listing query's select added - keep
    // those from the original row, only the flipped status is new.
    return updated ? { ...entry, ...updated } : entry;
  });
}

/**
 * Custom change (Backlog status): Backlog is never persisted - unlike
 * Missed, a future-dated task doesn't need a DB write to "become" Pending
 * again once its date arrives; the read-time comparison below simply stops
 * relabeling it the moment `scheduled_date` is no longer after today. A
 * still-`Pending` entry scheduled for a day after today is relabeled
 * 'Backlog' for display/gating purposes only - the stored `status` column
 * never actually changes. Applied after applyMissedTransition since the two
 * are mutually exclusive by construction (Missed only ever touches rows
 * strictly *before* today, Backlog only rows strictly *after*).
 */
function applyBacklogLabel(entries: CareLogEntry[]): CareLogEntry[] {
  const today = new Date().toISOString().slice(0, 10);

  return entries.map((entry) =>
    entry.status === 'Pending' && entry.scheduled_date > today
      ? { ...entry, status: 'Backlog' }
      : entry
  );
}

/**
 * Backs the Boarding Checklist (#80 AC-1, renamed/merged from the old Hotel
 * Care Log; redesign widened `date` to an optional [dateFrom, dateTo] range
 * since Hotel stays span multiple days) - every scheduled care action in
 * range across active Hotel AND Daycare stays at the caller's branch,
 * completed or not. stay_type/pet_id are pulled through the join so the
 * client can split into Hotel/Daycare subtabs and show the pet's name
 * without a second round-trip per entry. Omitting both dateFrom/dateTo
 * returns every scheduled entry, unbounded.
 */
export async function getCareLogEntries({
  branchId,
  dateFrom,
  dateTo,
}: ListParams): Promise<CareLogEntry[]> {
  let query = supabase
    .from('care_log_entries')
    .select(CARE_LOG_ENTRY_SELECT)
    .eq('stays.status', 'Active')
    .eq('stays.branch_id', branchId);

  if (dateFrom) query = query.gte('scheduled_date', dateFrom);
  if (dateTo) query = query.lte('scheduled_date', dateTo);

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  const withMissed = await applyMissedTransition(
    (data ?? []) as unknown as CareLogEntry[]
  );

  return applyBacklogLabel(withMissed);
}

interface StartParams {
  entryId: string;
  /** Custom change (activity logbook): optional so any other internal
   * caller that doesn't have a requester in scope keeps working unchanged. */
  actorStaffId?: string;
}

/**
 * Custom change (Boarding Checklist Kanban): Pending -> In Progress. No
 * staff-id/timestamp tracked for this transition (unlike completion) - the
 * status column alone is enough to drive the Kanban board's middle column,
 * and the completion path already records who/when for the terminal state.
 */
export async function startCareLogEntry({
  entryId,
  actorStaffId,
}: StartParams): Promise<CareLogEntry> {
  const { data, error } = await supabase
    .from('care_log_entries')
    .update({ status: 'In Progress' })
    .eq('id', entryId)
    .eq('status', 'Pending')
    .select(CARE_LOG_ENTRY_SELECT)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) {
    throwWithStatus(409, 'This care log entry is not Pending');
  }

  const entry = data as CareLogEntry;

  await recordActivity({
    branchId: entry.stays!.branch_id,
    stayId: entry.stay_id,
    careLogEntryId: entry.id,
    action: 'task_started',
    actorStaffId,
    description: `Started: ${entry.description}`,
  });

  return entry;
}

/**
 * Custom change (Boarding Checklist Kanban): reopens a task back to
 * Pending - covers both the checkbox's "uncheck a completed task" affordance
 * and an explicit "back to Pending" action from In Progress or Missed.
 * Clears completed_at/completed_by so a reopened task doesn't keep a stale
 * completion record.
 */
export async function reopenCareLogEntry({
  entryId,
  actorStaffId,
}: StartParams): Promise<CareLogEntry> {
  const { data, error } = await supabase
    .from('care_log_entries')
    .update({ status: 'Pending', completed_at: null, completed_by: null })
    .eq('id', entryId)
    .neq('status', 'Pending')
    .select(CARE_LOG_ENTRY_SELECT)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) {
    throwWithStatus(409, 'This care log entry is already Pending');
  }

  const entry = data as CareLogEntry;

  await recordActivity({
    branchId: entry.stays!.branch_id,
    stayId: entry.stay_id,
    careLogEntryId: entry.id,
    action: 'task_reopened',
    actorStaffId,
    description: `Reopened to Pending: ${entry.description}`,
  });

  return entry;
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
    .select(CARE_LOG_ENTRY_SELECT)
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

  const completedEntry = updated as CareLogEntry;

  // Staff no longer gate this per stay (see HotelCheckInPanel - the
  // "Owner opted in" checkbox was removed) - the customer's own
  // notification_preferences['care_log_completed'] is now the sole gate,
  // enforced downstream inside sendCareLogCompletedNotification/
  // createNotification.
  await sendCareLogCompletedNotification(completedEntry, stay.pet_id);

  await recordActivity({
    branchId: completedEntry.stays!.branch_id,
    stayId: completedEntry.stay_id,
    careLogEntryId: completedEntry.id,
    action: 'task_completed',
    actorStaffId: completedByStaffId,
    description: `Completed: ${completedEntry.description}`,
  });

  return completedEntry;
}

/**
 * Custom change (checkout gating): a stay may not be checked out while its
 * Boarding Checklist still has actionable tasks. Missed is deliberately
 * excluded - it's a terminal state for a task nobody can act on anymore, so
 * treating it as blocking would leave a stay permanently un-checkoutable
 * over a task from an earlier day. Backlog (a future-dated task, relabeled
 * by applyBacklogLabel below) is excluded for the opposite reason - a task
 * that isn't due yet has no business blocking an early checkout; if the
 * guest is leaving today, a task scheduled for tomorrow was never going to
 * happen anyway. Applies the same lazy transitions as getCareLogEntries so
 * a query run right at checkout time sees current state, not stale rows.
 */
export async function assertChecklistComplete(stayId: string): Promise<void> {
  // Custom change (activity logbook): joins `stays(branch_id)` now too - not
  // needed for the gating check itself, but applyMissedTransition's own
  // activity-log write (fired from every caller, this one included) needs
  // branch_id on each entry.
  const { data, error } = await supabase
    .from('care_log_entries')
    .select('*, stays!inner(branch_id)')
    .eq('stay_id', stayId);

  if (error) throwWithStatus(400, error.message);

  const withMissed = await applyMissedTransition(
    (data ?? []) as unknown as CareLogEntry[]
  );
  const entries = applyBacklogLabel(withMissed);

  const outstanding = entries.filter(
    (entry) => entry.status === 'Pending' || entry.status === 'In Progress'
  );

  if (outstanding.length > 0) {
    throwWithStatus(
      409,
      `Boarding checklist has ${outstanding.length} incomplete task${outstanding.length === 1 ? '' : 's'}`
    );
  }
}
