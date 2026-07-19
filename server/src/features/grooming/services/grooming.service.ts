import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { GroomingSession, GroomingStatus } from '../grooming.types.ts';

const GROOMING_SESSION_SELECT = '*, booking:bookings(*, booking_addons(*))';

const MANAGER_ROLES = ['Admin', 'Supervisor', 'Superadmin'];

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function todayRangeUtc(): { dayStart: string; dayEnd: string } {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart: dayStart.toISOString(), dayEnd: dayEnd.toISOString() };
}

interface ListGroomingQueueParams {
  requesterId: string;
  requesterRole: string;
  requesterBranchId: string;
}

/**
 * Today's confirmed Grooming bookings, scoped by role (own sessions for a
 * Groomer; own branch for Admin/Supervisor; all branches for Superadmin).
 * Auto-vivifies a grooming_sessions row (status 'Waiting') for any matching
 * booking that doesn't have one yet - #64's Affected Files list only
 * grooming.service.ts/grooming.routes.ts, so booking.service.ts (Sprint 2
 * Epic B, already merged) is never touched; this lazy creation is what lets
 * the queue exist without a DB trigger or a change to booking creation.
 */
export async function listGroomingQueue({
  requesterId,
  requesterRole,
  requesterBranchId,
}: ListGroomingQueueParams): Promise<GroomingSession[]> {
  const { dayStart, dayEnd } = todayRangeUtc();

  let bookingQuery = supabase
    .from('bookings')
    .select('id, assigned_staff_id, branch_id')
    .eq('service_category', 'Grooming')
    .eq('status', 'Confirmed')
    .gte('scheduled_start', dayStart)
    .lt('scheduled_start', dayEnd);

  if (requesterRole === 'Groomer') {
    bookingQuery = bookingQuery.eq('assigned_staff_id', requesterId);
  } else if (requesterRole === 'Admin' || requesterRole === 'Supervisor') {
    bookingQuery = bookingQuery.eq('branch_id', requesterBranchId);
  }
  // Superadmin: no filter - sees every branch.

  const { data: bookings, error: bookingsError } = await bookingQuery;

  if (bookingsError) throwWithStatus(400, bookingsError.message);

  const bookingRows = (bookings ?? []) as Array<{
    id: string;
    assigned_staff_id: string;
  }>;

  if (bookingRows.length === 0) return [];

  const bookingIds = bookingRows.map((row) => row.id);

  const { data: existingSessions, error: existingError } = await supabase
    .from('grooming_sessions')
    .select('booking_id')
    .in('booking_id', bookingIds);

  if (existingError) throwWithStatus(400, existingError.message);

  const existingBookingIds = new Set(
    (existingSessions ?? []).map((row) => row.booking_id as string)
  );
  const missing = bookingRows.filter((row) => !existingBookingIds.has(row.id));

  if (missing.length > 0) {
    const { error: insertError } = await supabase
      .from('grooming_sessions')
      .insert(
        missing.map((row) => ({
          booking_id: row.id,
          assigned_groomer_id: row.assigned_staff_id,
          status: 'Waiting',
        }))
      );

    if (insertError) throwWithStatus(400, insertError.message);
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('grooming_sessions')
    .select(GROOMING_SESSION_SELECT)
    .in('booking_id', bookingIds);

  if (sessionsError) throwWithStatus(400, sessionsError.message);

  const rows = (sessions ?? []) as GroomingSession[];

  // Queue order: queue_position when set, otherwise fall back to the
  // booking's scheduled_start (chronological) - per Modules-Features and the
  // M04 Process 1 flow diagram.
  return rows.sort((a, b) => {
    if (a.queue_position != null && b.queue_position != null) {
      return a.queue_position - b.queue_position;
    }
    if (a.queue_position != null) return -1;
    if (b.queue_position != null) return 1;

    return (
      new Date(a.booking!.scheduled_start).getTime() -
      new Date(b.booking!.scheduled_start).getTime()
    );
  });
}

const FORWARD_TRANSITIONS: Record<string, GroomingStatus> = {
  Waiting: 'In Progress',
  'In Progress': 'Completed',
};

interface TransitionGroomingStatusParams {
  requesterId: string;
  requesterRole: string;
  sessionId: string;
  targetStatus: GroomingStatus;
}

/**
 * Issue #64: Waiting -> In Progress just sets started_at + status (no side
 * effects). In Progress -> Completed sets completed_at + status, then sets
 * the underlying bookings.status = 'Completed', marking the record
 * billing-ready. No transactions table exists yet (M08 is Sprint 5), so
 * "billing-ready" here just means the booking's status is Completed and its
 * already-snapshotted total_price is queryable by whatever surfaces the
 * future Cashier view.
 * TODO(Sprint 5, M08): create a real transaction here once M08 lands.
 */
export async function transitionGroomingSessionStatus({
  requesterId,
  requesterRole,
  sessionId,
  targetStatus,
}: TransitionGroomingStatusParams): Promise<GroomingSession> {
  const { data: session, error } = await supabase
    .from('grooming_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!session) throwWithStatus(404, 'Grooming session not found');

  const isOwner = session.assigned_groomer_id === requesterId;
  const isManager = MANAGER_ROLES.includes(requesterRole);

  if (!isOwner && !isManager) {
    throwWithStatus(403, 'Forbidden');
  }

  if (session.status === 'Completed') {
    throwWithStatus(409, 'This grooming session is already finalized');
  }

  if (FORWARD_TRANSITIONS[session.status] !== targetStatus) {
    throwWithStatus(
      409,
      `Cannot transition from ${session.status} to ${targetStatus}`
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: targetStatus,
    updated_at: now,
  };

  if (targetStatus === 'In Progress') update.started_at = now;
  if (targetStatus === 'Completed') update.completed_at = now;

  const { data: updated, error: updateError } = await supabase
    .from('grooming_sessions')
    .update(update)
    .eq('id', sessionId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to update grooming session'
    );
  }

  if (targetStatus === 'Completed') {
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ status: 'Completed', updated_at: now })
      .eq('id', session.booking_id);

    if (bookingError) throwWithStatus(400, bookingError.message);
  }

  return updated as GroomingSession;
}
