import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { StaffAttendanceStatus } from '../staff.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** The leave a saved Present mark can lift. Must match get_staff_availability's
 * Check 3 (20261101295). Sick and Vacation Leave can never be overridden. */
export const OVERRIDABLE_LEAVE_TYPES: readonly string[] = ['Rest Day', 'Other'];

export function branchLocalDate(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}

export interface AttendanceMark {
  status: StaffAttendanceStatus;
  displayName: string | null;
}

/** Saved marks for a day, by staff id. No entry means the default. */
export async function loadAttendanceMarks(
  staffIds: string[],
  date: string
): Promise<Map<string, AttendanceMark>> {
  if (staffIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('staff_attendance')
    .select(
      'staff_id, status, staff:staff_profiles!staff_attendance_staff_id_fkey(display_name)'
    )
    .in('staff_id', staffIds)
    .eq('attendance_date', date);

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as unknown as Array<{
    staff_id: string;
    status: StaffAttendanceStatus;
    staff: { display_name: string } | null;
  }>;

  return new Map(
    rows.map((row) => [
      row.staff_id,
      { status: row.status, displayName: row.staff?.display_name ?? null },
    ])
  );
}

/**
 * Why a booking can't be checked in today because of its staff member, or
 * null. The TypeScript twin of get_staff_availability's Checks 3 and 4, for
 * the check-in gate and the Grooming queue's warning, which read the day's
 * leave directly instead of calling the function.
 */
export function resolveStaffCheckInBlock({
  staffName,
  mark,
  leaveTypes,
}: {
  staffName: string;
  mark: AttendanceMark | undefined;
  leaveTypes: string[];
}): string | null {
  if (mark?.status === 'Absent') {
    return `${staffName} is marked absent today - check-in isn't available.`;
  }

  const leaveType = leaveTypes.find(
    (type) =>
      !(mark?.status === 'Present' && OVERRIDABLE_LEAVE_TYPES.includes(type))
  );

  return leaveType
    ? `${staffName} has an approved ${leaveType} today - check-in isn't available until they're back.`
    : null;
}
