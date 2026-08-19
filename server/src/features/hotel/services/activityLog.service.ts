import { supabase } from '../../../config/supabase/supabase.config.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export type ActivityLogAction =
  | 'check_in'
  | 'check_out'
  | 'task_started'
  | 'task_completed'
  | 'task_reopened'
  | 'task_missed';

export interface ActivityLogEntry {
  id: string;
  branch_id: string;
  stay_id: string | null;
  care_log_entry_id: string | null;
  action: ActivityLogAction;
  actor_staff_id: string | null;
  description: string;
  created_at: string;
  /** Only populated by listActivityLog's join - null for a system-driven
   * entry (the lazy Missed transition never sets actor_staff_id). */
  actor_staff?: { display_name: string } | null;
}

interface RecordActivityParams {
  branchId: string;
  action: ActivityLogAction;
  description: string;
  stayId?: string | null;
  careLogEntryId?: string | null;
  /** Omitted/null for a system-driven entry (e.g. the lazy Missed
   * transition - nobody clicked anything). */
  actorStaffId?: string | null;
}

/**
 * Custom change: Hotel/Daycare activity logbook (#48 follow-up). Best-effort
 * and non-blocking, same convention as careLogNotifications.service.ts's
 * sendCareLogCompletedNotification - a logging failure must never fail the
 * real action (check-in, checkout, a task status change) it's recording.
 * Every call site fires this after its own write has already succeeded.
 */
export async function recordActivity({
  branchId,
  action,
  description,
  stayId = null,
  careLogEntryId = null,
  actorStaffId = null,
}: RecordActivityParams): Promise<void> {
  try {
    const { error } = await supabase.from('activity_log').insert({
      branch_id: branchId,
      stay_id: stayId,
      care_log_entry_id: careLogEntryId,
      action,
      actor_staff_id: actorStaffId,
      description,
    });

    if (error) {
      console.error('Failed to record activity log entry:', error.message);
    }
  } catch (error) {
    console.error('Failed to record activity log entry:', error);
  }
}

/** Custom change (activity logbook, bulk write): the lazy Missed transition
 * can flip many entries in one call - one activity_log row per flipped
 * entry, inserted in a single batch rather than one insert per row. Fire-
 * and-forget like recordActivity above - never throws, never blocks the
 * read path it's attached to. */
export async function recordBulkActivity(
  rows: Omit<RecordActivityParams, 'actorStaffId'>[]
): Promise<void> {
  if (rows.length === 0) return;

  try {
    const { error } = await supabase.from('activity_log').insert(
      rows.map((row) => ({
        branch_id: row.branchId,
        stay_id: row.stayId ?? null,
        care_log_entry_id: row.careLogEntryId ?? null,
        action: row.action,
        actor_staff_id: null,
        description: row.description,
      }))
    );

    if (error) {
      console.error(
        'Failed to record bulk activity log entries:',
        error.message
      );
    }
  } catch (error) {
    console.error('Failed to record bulk activity log entries:', error);
  }
}

interface ListActivityLogParams {
  /** Null = Superadmin's cross-branch view (mirrors
   * careLogFlagging.service.ts's since-removed identical convention, and
   * hotel.controller.ts's flaggedCareLogEntriesController before it). */
  branchId: string | null;
  stayId?: string;
  /** Inclusive YYYY-MM-DD bounds against created_at. */
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 200;

/** Backs the Boarding Checklist's Logbook view - newest first, optionally
 * scoped to one stay (a "history for this pet's stay" view) or a date
 * range. actor_staff is joined so the client can show who did what without
 * a second round-trip per row. */
export async function listActivityLog({
  branchId,
  stayId,
  dateFrom,
  dateTo,
  limit,
}: ListActivityLogParams): Promise<ActivityLogEntry[]> {
  let query = supabase
    .from('activity_log')
    .select('*, actor_staff:staff_profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(limit ?? DEFAULT_LIMIT);

  if (branchId) query = query.eq('branch_id', branchId);
  if (stayId) query = query.eq('stay_id', stayId);

  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  }

  if (dateTo) {
    const exclusiveEnd = new Date(
      new Date(`${dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    query = query.lt('created_at', exclusiveEnd);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as unknown as ActivityLogEntry[];
}
