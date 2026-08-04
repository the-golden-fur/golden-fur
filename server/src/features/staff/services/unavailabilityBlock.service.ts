import { supabase } from '../../../config/supabase/supabase.config.ts';
import { UNAVAILABILITY_MANAGER_ROLES } from '../staff.types.ts';
import type {
  BranchScheduleEntry,
  PendingUnavailabilityBlock,
  PendingUnavailabilityBlockStaffSummary,
  RequestedReviewerSummary,
  UnavailabilityBlock,
  UnavailabilityLeaveType,
} from '../staff.types.ts';

interface OperatingHoursEntry {
  open: string;
  close: string;
}

type OperatingHours = Record<string, OperatingHoursEntry>;

interface CreateUnavailabilityBlockParams {
  requesterId: string;
  requesterRole: string;
  /** Required when acting on behalf of another staff member (branch-scoped
   * manager access) - unused for self-service. */
  requesterBranchId?: string;
  targetStaffId: string;
  quickAction?: boolean;
  /** Entire Day option - blocks the target's branch operating-hours window
   * for `date` instead of a start_time/end_time range. Still goes through
   * the same pending-vs-auto-approved rule as any other custom-range
   * request (self-request = pending, on-behalf = auto-approved) - it isn't
   * a third approval path, just a different way of computing the window. */
  isFullDay?: boolean;
  /** YYYY-MM-DD, branch-local - required when isFullDay is set. */
  date?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  /** Optional, non-binding "send to" hint - see staff.types.ts. */
  requestedReviewerId?: string;
  leaveType?: UnavailabilityLeaveType;
  now?: Date;
}

interface CancelUnavailabilityBlockParams {
  requesterId: string;
  requesterRole: string;
  requesterBranchId?: string;
  targetStaffId: string;
  blockId: string;
}

interface ListUnavailabilityBlocksParams {
  requesterId: string;
  requesterRole: string;
  targetStaffId: string;
}

interface ReviewUnavailabilityBlockParams {
  requesterId: string;
  requesterRole: string;
  targetStaffId: string;
  blockId: string;
  decision: 'approved' | 'denied';
  denialReason?: string;
}

interface ListPendingUnavailabilityBlocksParams {
  requesterId: string;
  requesterRole: string;
  requesterBranchId: string;
}

interface ListBranchScheduleParams {
  requesterRole: string;
  requesterBranchId: string;
  branchId: string;
  /** ISO datetimes bounding the requested month - overlap-tested against
   * each block's [start_time, end_time), same as every other range query
   * in this file. */
  rangeStart: string;
  rangeEnd: string;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function assertCanActOnTarget(
  requesterId: string,
  requesterRole: string,
  targetStaffId: string
) {
  const isSelf = requesterId === targetStaffId;

  if (!isSelf && !UNAVAILABILITY_MANAGER_ROLES.includes(requesterRole)) {
    throwWithStatus(403, 'Forbidden');
  }
}

/**
 * Monthly schedule addendum: on-behalf-of management (rest days, vacation
 * leave, and every other unavailability action a manager takes for someone
 * else) is branch-scoped - Admin/Supervisor may only act on staff at their
 * own branch; Superadmin is exempt (system-wide, matching every other
 * Superadmin-vs-branch-scoped split in this feature, e.g.
 * listPendingUnavailabilityBlocks). Never called for self-service (isSelf
 * always trivially same-branch).
 */
function assertSameBranch(
  requesterRole: string,
  requesterBranchId: string | undefined,
  targetBranchId: string
) {
  if (requesterRole === 'Superadmin') {
    return;
  }

  if (!requesterBranchId || requesterBranchId !== targetBranchId) {
    throwWithStatus(403, 'Can only manage staff at your own branch');
  }
}

function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - date.getTime();
}

/**
 * Mirrors the day/offset resolution in the get_staff_availability() SQL
 * function so "end of shift" is computed the same way in both places.
 */
export function resolveShiftEnd(
  timezone: string,
  operatingHours: OperatingHours,
  now: Date
): Date {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  })
    .format(now)
    .toLowerCase();

  const hours = operatingHours?.[dayName];

  if (!hours?.close) {
    throwWithStatus(400, 'Branch has no operating hours configured for today');
  }

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [closeHour, closeMinute] = hours.close.split(':').map(Number);
  const naiveLocalMs = Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    closeHour,
    closeMinute,
    0
  );

  const offsetMs = getTimezoneOffsetMs(timezone, now);

  return new Date(naiveLocalMs - offsetMs);
}

/**
 * Entire Day option: the target's branch operating-hours window for a given
 * date, rather than "now until end of shift" (resolveShiftEnd above). Same
 * fixed-offset approximation resolveShiftEnd/availability.service.ts's
 * zonedTimeToUtc already rely on - safe since every branch today is
 * Asia/Manila, which never observes DST.
 */
function resolveDateWindow(
  timezone: string,
  operatingHours: OperatingHours,
  date: string
): { start: Date; end: Date } {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .toLowerCase();

  const hours = operatingHours?.[dayName];

  if (!hours?.open || !hours?.close) {
    throwWithStatus(
      400,
      'Branch has no operating hours configured for that date'
    );
  }

  function toUtc(time: string): Date {
    const [hour, minute] = time.split(':').map(Number);
    const naiveLocalMs = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hour,
      minute,
      0
    );
    const offsetMs = getTimezoneOffsetMs(timezone, new Date(naiveLocalMs));
    return new Date(naiveLocalMs - offsetMs);
  }

  return { start: toUtc(hours.open), end: toUtc(hours.close) };
}

export async function createUnavailabilityBlock({
  requesterId,
  requesterRole,
  requesterBranchId,
  targetStaffId,
  quickAction,
  isFullDay,
  date,
  startTime,
  endTime,
  reason,
  requestedReviewerId,
  leaveType,
  now = new Date(),
}: CreateUnavailabilityBlockParams): Promise<UnavailabilityBlock> {
  assertCanActOnTarget(requesterId, requesterRole, targetStaffId);

  // Rest days are fixed and decided by a Supervisor/Admin/Superadmin -
  // never self-service, unlike every other leave_type.
  if (leaveType === 'Rest Day' && requesterId === targetStaffId) {
    throwWithStatus(
      403,
      'Rest days can only be set by a Supervisor, Admin, or Superadmin'
    );
  }

  const { data: targetProfile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('id, branch_id')
    .eq('id', targetStaffId)
    .maybeSingle();

  if (profileError) throwWithStatus(400, profileError.message);
  if (!targetProfile) throwWithStatus(404, 'Staff profile not found');

  if (requesterId !== targetStaffId) {
    assertSameBranch(requesterRole, requesterBranchId, targetProfile.branch_id);
  }

  if (requestedReviewerId) {
    const { data: reviewer, error: reviewerError } = await supabase
      .from('staff_profiles')
      .select('id, role, branch_id')
      .eq('id', requestedReviewerId)
      .maybeSingle();

    if (reviewerError) throwWithStatus(400, reviewerError.message);
    if (
      !reviewer ||
      reviewer.branch_id !== targetProfile.branch_id ||
      !UNAVAILABILITY_MANAGER_ROLES.includes(reviewer.role)
    ) {
      throwWithStatus(
        400,
        'requested_reviewer_id must be a Supervisor, Admin, or Superadmin at the same branch'
      );
    }
  }

  let resolvedStart: Date;
  let resolvedEnd: Date;

  if (quickAction || isFullDay) {
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('operating_hours, timezone')
      .eq('id', targetProfile.branch_id)
      .maybeSingle();

    if (branchError) throwWithStatus(400, branchError.message);
    if (!branch) throwWithStatus(400, 'Branch not found for staff member');

    if (quickAction) {
      resolvedStart = now;
      resolvedEnd = resolveShiftEnd(
        branch.timezone,
        branch.operating_hours ?? {},
        resolvedStart
      );
    } else {
      if (!date) {
        throwWithStatus(400, 'date is required for a full-day request');
      }

      const window = resolveDateWindow(
        branch.timezone,
        branch.operating_hours ?? {},
        date
      );
      resolvedStart = window.start;
      resolvedEnd = window.end;
    }
  } else {
    if (!startTime || !endTime) {
      throwWithStatus(400, 'start_time and end_time are required');
    }

    resolvedStart = new Date(startTime);
    resolvedEnd = new Date(endTime);

    if (
      Number.isNaN(resolvedStart.getTime()) ||
      Number.isNaN(resolvedEnd.getTime())
    ) {
      throwWithStatus(400, 'Invalid start_time or end_time');
    }
  }

  if (resolvedEnd <= resolvedStart) {
    throwWithStatus(400, 'end_time must be after start_time');
  }

  // quickAction's resolvedStart is `now` itself, so it's always exactly
  // non-past - excluded explicitly rather than relying on that equality.
  if (!quickAction && resolvedStart.getTime() < now.getTime()) {
    throwWithStatus(400, 'start_time cannot be in the past');
  }

  const { data: overlapping, error: overlapError } = await supabase
    .from('staff_unavailability_blocks')
    .select('id')
    .eq('staff_id', targetStaffId)
    .lt('start_time', resolvedEnd.toISOString())
    .gt('end_time', resolvedStart.toISOString())
    .limit(1);

  if (overlapError) throwWithStatus(400, overlapError.message);
  if (overlapping && overlapping.length > 0) {
    throwWithStatus(409, 'Block overlaps an existing unavailability block');
  }

  const { data, error } = await supabase
    .from('staff_unavailability_blocks')
    .insert({
      staff_id: targetStaffId,
      start_time: resolvedStart.toISOString(),
      end_time: resolvedEnd.toISOString(),
      reason: reason ?? null,
      created_by: requesterId,
      is_quick_action: Boolean(quickAction),
      is_full_day: Boolean(isFullDay),
      requested_reviewer_id: requestedReviewerId ?? null,
      leave_type: leaveType ?? 'Other',
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to create unavailability block'
    );
  }

  return data;
}

export async function cancelUnavailabilityBlock({
  requesterId,
  requesterRole,
  requesterBranchId,
  targetStaffId,
  blockId,
}: CancelUnavailabilityBlockParams): Promise<void> {
  assertCanActOnTarget(requesterId, requesterRole, targetStaffId);

  const { data: existing, error: lookupError } = await supabase
    .from('staff_unavailability_blocks')
    .select('id')
    .eq('id', blockId)
    .eq('staff_id', targetStaffId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Unavailability block not found');

  if (requesterId !== targetStaffId) {
    const { data: targetProfile, error: profileError } = await supabase
      .from('staff_profiles')
      .select('branch_id')
      .eq('id', targetStaffId)
      .maybeSingle();

    if (profileError) throwWithStatus(400, profileError.message);
    if (!targetProfile) throwWithStatus(404, 'Staff profile not found');

    assertSameBranch(requesterRole, requesterBranchId, targetProfile.branch_id);
  }

  const { error } = await supabase
    .from('staff_unavailability_blocks')
    .delete()
    .eq('id', blockId);

  if (error) throwWithStatus(400, error.message);
}

export async function listUnavailabilityBlocks({
  requesterId,
  requesterRole,
  targetStaffId,
}: ListUnavailabilityBlocksParams): Promise<UnavailabilityBlock[]> {
  assertCanActOnTarget(requesterId, requesterRole, targetStaffId);

  const { data, error } = await supabase
    .from('staff_unavailability_blocks')
    .select('*')
    .eq('staff_id', targetStaffId)
    .gt('end_time', new Date().toISOString())
    .order('start_time', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

/**
 * Admin/Supervisor/Superadmin only (route-level requireRole). Approves or
 * denies a pending, self-requested block. The `requesterId === targetStaffId`
 * check is app-layer defense-in-depth alongside the RLS "staff_id <>
 * auth.uid()" restriction (...021) — this service uses the service-role
 * client and bypasses RLS entirely, so the RLS policy alone would not stop a
 * self-review here.
 */
export async function reviewUnavailabilityBlock({
  requesterId,
  requesterRole,
  targetStaffId,
  blockId,
  decision,
  denialReason,
}: ReviewUnavailabilityBlockParams): Promise<UnavailabilityBlock> {
  if (!UNAVAILABILITY_MANAGER_ROLES.includes(requesterRole)) {
    throwWithStatus(403, 'Forbidden');
  }

  if (requesterId === targetStaffId) {
    throwWithStatus(403, 'cannot_review_own_request');
  }

  const { data: existing, error: lookupError } = await supabase
    .from('staff_unavailability_blocks')
    .select('id, status')
    .eq('id', blockId)
    .eq('staff_id', targetStaffId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing || existing.status !== 'pending') {
    throwWithStatus(404, 'Unavailability block not found or not pending');
  }

  const { data, error } = await supabase
    .from('staff_unavailability_blocks')
    .update({
      status: decision,
      reviewed_by: requesterId,
      reviewed_at: new Date().toISOString(),
      denial_reason: decision === 'denied' ? (denialReason ?? null) : null,
    })
    .eq('id', blockId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to review unavailability block'
    );
  }

  return data;
}

/**
 * Admin/Supervisor/Superadmin only (route-level requireRole). Returns every
 * pending block, branch-scoped for Admin/Supervisor (Superadmin sees all
 * branches), with the caller's own pending row included but flagged
 * non-reviewable rather than omitted (#29 AC-8).
 */
export async function listPendingUnavailabilityBlocks({
  requesterId,
  requesterRole,
  requesterBranchId,
}: ListPendingUnavailabilityBlocksParams): Promise<
  PendingUnavailabilityBlock[]
> {
  if (!UNAVAILABILITY_MANAGER_ROLES.includes(requesterRole)) {
    throwWithStatus(403, 'Forbidden');
  }

  const { data, error } = await supabase
    .from('staff_unavailability_blocks')
    .select(
      '*, staff:staff_profiles!staff_unavailability_blocks_staff_id_fkey(id, display_name, profile_photo_url, role, branch_id), requested_reviewer:staff_profiles!staff_unavailability_blocks_requested_reviewer_id_fkey(id, display_name)'
    )
    .eq('status', 'pending')
    .order('start_time', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as Array<
    UnavailabilityBlock & {
      staff: PendingUnavailabilityBlockStaffSummary | null;
      requested_reviewer: RequestedReviewerSummary | null;
    }
  >;

  const scoped =
    requesterRole === 'Superadmin'
      ? rows
      : rows.filter((row) => row.staff?.branch_id === requesterBranchId);

  return scoped.map((row) => ({
    ...row,
    reviewable: row.staff_id !== requesterId,
  }));
}

/**
 * Monthly Schedule calendar (branch-shared, equal CRUD for Admin/Supervisor/
 * Superadmin - #3 addendum). Only full-day entries belong on a day-
 * granularity month grid; partial-day quick actions/custom ranges stay out
 * of this specific view (they still show on the self-service Days Off page
 * and the pending-approval queue). Every status is included (not just
 * approved) so managers can see what's still pending review, unlike
 * get_staff_availability()'s Check 3 which only ever excludes approved rows.
 */
export async function listBranchSchedule({
  requesterRole,
  requesterBranchId,
  branchId,
  rangeStart,
  rangeEnd,
}: ListBranchScheduleParams): Promise<BranchScheduleEntry[]> {
  if (!UNAVAILABILITY_MANAGER_ROLES.includes(requesterRole)) {
    throwWithStatus(403, 'Forbidden');
  }

  if (requesterRole !== 'Superadmin' && requesterBranchId !== branchId) {
    throwWithStatus(403, 'Can only view schedules for your own branch');
  }

  const { data, error } = await supabase
    .from('staff_unavailability_blocks')
    .select(
      '*, staff:staff_profiles!staff_unavailability_blocks_staff_id_fkey(id, display_name, profile_photo_url, role, branch_id)'
    )
    .eq('is_full_day', true)
    .lt('start_time', rangeEnd)
    .gt('end_time', rangeStart)
    .order('start_time', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as Array<
    UnavailabilityBlock & {
      staff: PendingUnavailabilityBlockStaffSummary | null;
    }
  >;

  const scoped = rows.filter((row) => row.staff?.branch_id === branchId);

  const creatorIds = [...new Set(scoped.map((row) => row.created_by))];

  const { data: creators, error: creatorsError } = creatorIds.length
    ? await supabase
        .from('staff_profiles')
        .select('id, display_name')
        .in('id', creatorIds)
    : { data: [] as Array<{ id: string; display_name: string }>, error: null };

  if (creatorsError) throwWithStatus(400, creatorsError.message);

  const creatorNameById = new Map(
    (creators ?? []).map((creator) => [creator.id, creator.display_name])
  );

  return scoped.map((row) => ({
    ...row,
    created_by_name: creatorNameById.get(row.created_by) ?? null,
  }));
}
