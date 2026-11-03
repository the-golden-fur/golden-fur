import { supabase } from '../../../config/supabase/supabase.config.ts';
import { resolveBranchDayWindow } from '../../booking/services/availability.service.ts';
import {
  listAvailableStaff,
  pickRandomAvailableStaff,
} from '../../booking/services/staffPicker.service.ts';
import type { ServiceCategory } from '../../booking/booking.types.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { StaffAttendanceStatus } from '../staff.types.ts';
import {
  branchLocalDate,
  loadAttendanceMarks,
  OVERRIDABLE_LEAVE_TYPES,
} from './attendanceAvailability.service.ts';

/** Leave a Supervisor can't mark over - the row is read-only. */
const LOCKED_LEAVE_TYPES: readonly string[] = ['Sick Leave', 'Vacation Leave'];

const STAFF_SERVICE_CATEGORIES = ['Grooming', 'Veterinary'];
const NOT_STARTED_STATUSES = ['Pending', 'Late'];

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface BranchScope {
  requesterRole: string;
  requesterBranchId: string;
  branchId: string;
}

function assertBranchAccess({
  requesterRole,
  requesterBranchId,
  branchId,
}: BranchScope) {
  if (requesterRole !== 'Superadmin' && requesterBranchId !== branchId) {
    throwWithStatus(403, 'Can only manage attendance for your own branch');
  }
}

async function getBranchTimezone(branchId: string): Promise<string> {
  const { data, error } = await supabase
    .from('branches')
    .select('timezone')
    .eq('id', branchId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Branch not found');

  return data.timezone as string;
}

/** Approved leave touching a branch-local day, even part of it, by staff id. */
async function loadLeaveForDay(
  staffIds: string[],
  date: string,
  timezone: string
): Promise<Map<string, string[]>> {
  const leave = new Map<string, string[]>();
  if (staffIds.length === 0) return leave;

  const { start, end } = resolveBranchDayWindow(date, timezone);
  const { data, error } = await supabase
    .from('staff_unavailability_blocks')
    .select('staff_id, leave_type')
    .in('staff_id', staffIds)
    .eq('status', 'approved')
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString());

  if (error) throwWithStatus(400, error.message);

  for (const row of (data ?? []) as Array<{
    staff_id: string;
    leave_type: string;
  }>) {
    leave.set(row.staff_id, [
      ...(leave.get(row.staff_id) ?? []),
      row.leave_type,
    ]);
  }

  return leave;
}

interface AffectedBooking {
  id: string;
  customer_id: string;
  branch_id: string;
  service_category: ServiceCategory;
  scheduled_start: string;
  scheduled_end: string;
  pets: { name: string } | null;
}

/** Bookings an Absent mark moves: not started yet, in time order so earlier
 * ones are placed first. */
async function loadAffectedBookings(
  staffIds: string[],
  date: string,
  timezone: string
): Promise<Array<AffectedBooking & { assigned_staff_id: string }>> {
  if (staffIds.length === 0) return [];

  const { start, end } = resolveBranchDayWindow(date, timezone);
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, branch_id, assigned_staff_id, service_category, scheduled_start, scheduled_end, pets(name)'
    )
    .in('assigned_staff_id', staffIds)
    .in('status', NOT_STARTED_STATUSES)
    .in('service_category', STAFF_SERVICE_CATEGORIES)
    .gte('scheduled_start', start.toISOString())
    .lt('scheduled_start', end.toISOString())
    .order('scheduled_start', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as unknown as Array<
    AffectedBooking & { assigned_staff_id: string }
  >;
}

export interface AttendanceRow {
  staff_id: string;
  display_name: string;
  role: string;
  /** null when a Rest Day/Other block means they aren't expected in. */
  status: StaffAttendanceStatus | null;
  leave_type: string | null;
  locked: boolean;
  booking_count: number;
}

export interface AttendanceDay {
  date: string;
  today: string;
  rows: AttendanceRow[];
}

export async function getAttendanceDay({
  date,
  ...scope
}: BranchScope & { date?: string }): Promise<AttendanceDay> {
  assertBranchAccess(scope);

  const timezone = await getBranchTimezone(scope.branchId);
  const today = branchLocalDate(timezone);
  const targetDate = date ?? today;

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, display_name, role')
    .eq('branch_id', scope.branchId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('display_name', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const roster = (data ?? []) as Array<{
    id: string;
    display_name: string;
    role: string;
  }>;
  const staffIds = roster.map((staff) => staff.id);

  const [marks, leave, bookings] = await Promise.all([
    loadAttendanceMarks(staffIds, targetDate),
    loadLeaveForDay(staffIds, targetDate, timezone),
    loadAffectedBookings(staffIds, targetDate, timezone),
  ]);

  const rows = roster.map((staff): AttendanceRow => {
    const leaveTypes = leave.get(staff.id) ?? [];
    const lockedLeave = leaveTypes.find((type) =>
      LOCKED_LEAVE_TYPES.includes(type)
    );
    const leaveType = lockedLeave ?? leaveTypes[0] ?? null;

    return {
      staff_id: staff.id,
      display_name: staff.display_name,
      role: staff.role,
      status:
        marks.get(staff.id)?.status ?? (leaveType === null ? 'Present' : null),
      leave_type: leaveType,
      locked: lockedLeave !== undefined,
      booking_count: bookings.filter(
        (booking) => booking.assigned_staff_id === staff.id
      ).length,
    };
  });

  return { date: targetDate, today, rows };
}

export interface MovedBooking {
  booking_id: string;
  pet_name: string | null;
  service_category: ServiceCategory;
  scheduled_start: string;
  assigned_to: string | null;
}

/** Points the booking and its service record at the new staff member. A
 * consultation a vet has already claimed keeps its vet. */
async function moveBooking(
  booking: AffectedBooking,
  fromStaffId: string,
  toStaffId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      assigned_staff_id: toStaffId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .eq('assigned_staff_id', fromStaffId)
    .in('status', NOT_STARTED_STATUSES)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) return false;

  if (booking.service_category === 'Grooming') {
    await supabase
      .from('grooming_sessions')
      .update({ assigned_groomer_id: toStaffId })
      .eq('booking_id', booking.id);
  } else {
    await supabase
      .from('consultations')
      .update({ veterinarian_id: toStaffId })
      .eq('booking_id', booking.id)
      .is('accepted_by', null);
  }

  return true;
}

async function notifyCustomerOfMove(
  booking: AffectedBooking,
  staffName: string
): Promise<void> {
  try {
    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'booking_rescheduled',
      title: 'Your staff member has changed',
      message: `${staffName} will now look after ${booking.pets?.name ?? 'your pet'} for your ${booking.service_category} booking. The time hasn't changed.`,
      relatedBookingId: booking.id,
    });
  } catch (error) {
    console.error(`Failed to notify about booking ${booking.id}:`, error);
  }
}

/**
 * Moves an absent staff member's unstarted bookings to whoever is available.
 * Runs after the Absent mark is saved, so get_staff_availability already
 * excludes them. One at a time, because each move changes who is free for
 * the next. A booking nobody can take stays put for manual rescheduling.
 */
async function reassignBookingsForAbsence(
  staffId: string,
  date: string,
  timezone: string
): Promise<{ reassigned: MovedBooking[]; needs_rescheduling: MovedBooking[] }> {
  const bookings = await loadAffectedBookings([staffId], date, timezone);
  const reassigned: MovedBooking[] = [];
  const needsRescheduling: MovedBooking[] = [];

  for (const booking of bookings) {
    const summary = {
      booking_id: booking.id,
      pet_name: booking.pets?.name ?? null,
      service_category: booking.service_category,
      scheduled_start: booking.scheduled_start,
    };
    const replacement = pickRandomAvailableStaff(
      await listAvailableStaff({
        branchId: booking.branch_id,
        serviceCategory: booking.service_category,
        scheduledStart: booking.scheduled_start,
        scheduledEnd: booking.scheduled_end,
        excludeBookingId: booking.id,
      })
    );

    if (
      replacement &&
      (await moveBooking(booking, staffId, replacement.staff_id))
    ) {
      await notifyCustomerOfMove(booking, replacement.display_name);
      reassigned.push({ ...summary, assigned_to: replacement.display_name });
    } else {
      needsRescheduling.push({ ...summary, assigned_to: null });
    }
  }

  return { reassigned, needs_rescheduling: needsRescheduling };
}

interface SetAttendanceParams extends BranchScope {
  requesterId: string;
  staffId: string;
  date: string;
  status: StaffAttendanceStatus;
}

export async function setAttendance({
  requesterId,
  staffId,
  date,
  status,
  ...scope
}: SetAttendanceParams): Promise<{
  reassigned: MovedBooking[];
  needs_rescheduling: MovedBooking[];
}> {
  assertBranchAccess(scope);

  if (staffId === requesterId) {
    throwWithStatus(403, "You can't mark your own attendance");
  }

  const timezone = await getBranchTimezone(scope.branchId);

  if (date < branchLocalDate(timezone)) {
    throwWithStatus(409, "Past attendance can't be changed");
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('id', staffId)
    .eq('branch_id', scope.branchId)
    .eq('is_active', true)
    .is('archived_at', null)
    .maybeSingle();

  if (staffError) throwWithStatus(400, staffError.message);
  if (!staff) throwWithStatus(404, 'Staff member not found at this branch');

  const leaveTypes =
    (await loadLeaveForDay([staffId], date, timezone)).get(staffId) ?? [];

  if (leaveTypes.some((type) => LOCKED_LEAVE_TYPES.includes(type))) {
    throwWithStatus(409, 'This staff member is on approved leave');
  }

  // Present on an ordinary day is just the default, so nothing is kept - a
  // Rest Day added later must not be silently overridden by an old mark.
  const isDefault =
    status === 'Present' &&
    !leaveTypes.some((type) => OVERRIDABLE_LEAVE_TYPES.includes(type));

  if (isDefault) {
    const { error } = await supabase
      .from('staff_attendance')
      .delete()
      .eq('staff_id', staffId)
      .eq('attendance_date', date);

    if (error) throwWithStatus(400, error.message);
  } else {
    const { error } = await supabase.from('staff_attendance').upsert(
      {
        staff_id: staffId,
        branch_id: scope.branchId,
        attendance_date: date,
        status,
        marked_by: requesterId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,attendance_date' }
    );

    if (error) throwWithStatus(400, error.message);
  }

  return status === 'Absent'
    ? reassignBookingsForAbsence(staffId, date, timezone)
    : { reassigned: [], needs_rescheduling: [] };
}
