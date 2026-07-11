import { supabase } from '../../../config/supabase/supabase.config.ts';
import { ADMIN_ROLES } from '../staff.types.ts';
import type { UnavailabilityBlock } from '../staff.types.ts';

interface OperatingHoursEntry {
  open: string;
  close: string;
}

type OperatingHours = Record<string, OperatingHoursEntry>;

interface CreateUnavailabilityBlockParams {
  requesterId: string;
  requesterRole: string;
  targetStaffId: string;
  quickAction?: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
  now?: Date;
}

interface CancelUnavailabilityBlockParams {
  requesterId: string;
  requesterRole: string;
  targetStaffId: string;
  blockId: string;
}

interface ListUnavailabilityBlocksParams {
  requesterId: string;
  requesterRole: string;
  targetStaffId: string;
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

  if (!isSelf && !ADMIN_ROLES.includes(requesterRole)) {
    throwWithStatus(403, 'Forbidden');
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

export async function createUnavailabilityBlock({
  requesterId,
  requesterRole,
  targetStaffId,
  quickAction,
  startTime,
  endTime,
  reason,
  now = new Date(),
}: CreateUnavailabilityBlockParams): Promise<UnavailabilityBlock> {
  assertCanActOnTarget(requesterId, requesterRole, targetStaffId);

  const { data: targetProfile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('id, branch_id')
    .eq('id', targetStaffId)
    .maybeSingle();

  if (profileError) throwWithStatus(400, profileError.message);
  if (!targetProfile) throwWithStatus(404, 'Staff profile not found');

  let resolvedStart: Date;
  let resolvedEnd: Date;

  if (quickAction) {
    resolvedStart = now;

    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('operating_hours, timezone')
      .eq('id', targetProfile.branch_id)
      .maybeSingle();

    if (branchError) throwWithStatus(400, branchError.message);
    if (!branch) throwWithStatus(400, 'Branch not found for staff member');

    resolvedEnd = resolveShiftEnd(
      branch.timezone,
      branch.operating_hours ?? {},
      resolvedStart
    );
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
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create unavailability block');
  }

  return data;
}

export async function cancelUnavailabilityBlock({
  requesterId,
  requesterRole,
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
