import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  completeBooking,
  startBooking,
} from '../../booking/services/booking.service.ts';
import type { GroomingSession } from '../grooming.types.ts';
import type { TransitionGroomingStatusInput } from '../modules/validators/grooming.validator.ts';

const GROOMING_SESSION_SELECT = '*, booking:bookings(*, booking_items(*))';

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

/**
 * Defaults to today (unchanged from before the queue's date filter existed)
 * when neither bound is given - every existing caller/test relies on this.
 * Otherwise resolves the given inclusive [dateFrom, dateTo] (YYYY-MM-DD)
 * bounds to a UTC instant range, matching the QueueFilterBar date-range
 * presets on the client (client/src/shared/components/QueueFilterBar).
 */
function resolveDateRangeUtc(
  dateFrom?: string,
  dateTo?: string
): { dayStart: string; dayEnd: string } {
  if (!dateFrom && !dateTo) return todayRangeUtc();

  const dayStart = dateFrom
    ? `${dateFrom}T00:00:00.000Z`
    : '1970-01-01T00:00:00.000Z';
  const dayEnd = dateTo
    ? new Date(
        new Date(`${dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000
      ).toISOString()
    : '9999-12-31T00:00:00.000Z';

  return { dayStart, dayEnd };
}

interface ListGroomingQueueParams {
  requesterId: string;
  requesterRole: string;
  requesterBranchId: string;
  /** Inclusive date-range bounds (YYYY-MM-DD) - both default to today when
   * omitted. */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Grooming bookings in the given date range (today by default) that are
 * actively being worked (bookings.status = 'In Progress' only), scoped by
 * role (own sessions for a Groomer; own branch for Admin/Supervisor; all
 * branches for Superadmin).
 *
 * Walk-in booking flow change: this used to also include 'Pending'
 * bookings, so a receptionist-confirmed appointment appeared here before
 * the customer arrived. That's gone - a 'Pending' online booking now only
 * shows here once a receptionist checks it in (Bookings Queue's Check In
 * action, POST /bookings/:id/start) and it flips to 'In Progress'. Walk-in
 * bookings (booking_source = 'Walk-in') are created directly at 'In
 * Progress' (see createBooking in booking.service.ts) and so appear here
 * immediately, same as a freshly checked-in appointment - the two are
 * indistinguishable once they reach this queue, which is the point: this
 * queue is "who's actually here to be serviced," not "who's booked."
 *
 * Auto-vivifies a grooming_sessions row for any matching booking that
 * doesn't have one yet - #64's Affected Files list only
 * grooming.service.ts/grooming.routes.ts, so booking.service.ts (Sprint 2
 * Epic B, already merged) is never touched; this lazy creation is what lets
 * the queue exist without a DB trigger or a change to booking creation.
 */
export async function listGroomingQueue({
  requesterId,
  requesterRole,
  requesterBranchId,
  dateFrom,
  dateTo,
}: ListGroomingQueueParams): Promise<GroomingSession[]> {
  const { dayStart, dayEnd } = resolveDateRangeUtc(dateFrom, dateTo);

  let bookingQuery = supabase
    .from('bookings')
    .select('id, assigned_staff_id, branch_id')
    .eq('service_category', 'Grooming')
    .eq('status', 'In Progress')
    .gte('scheduled_start', dayStart)
    .lt('scheduled_start', dayEnd)
    // Custom change (P-1 roadmap item: generic downpayment): a booking
    // whose service/package requires a downpayment stays out of the queue
    // (and never gets a grooming_sessions row vivified below) until its
    // downpayment is paid - see 20260808111's dev notes.
    .or('downpayment_required.eq.false,payment_status.neq.Pending');

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

interface TransitionGroomingStatusParams {
  requesterId: string;
  requesterRole: string;
  sessionId: string;
  targetStatus: TransitionGroomingStatusInput['status'];
}

/**
 * Booking-status revision: grooming_sessions no longer has its own
 * Waiting/In Progress/Completed state machine - the underlying booking's
 * status (driven by the shared startBooking/completeBooking in
 * booking.service.ts) is the single source of truth now. This function's
 * job shrinks to authorization (unchanged: the assigned groomer, or an
 * Admin/Supervisor/Superadmin manager, per #64 AC-3) plus dispatching to the
 * right shared transition - their own 409s (invalid transition) propagate
 * naturally instead of being re-implemented here.
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

  if (targetStatus === 'In Progress') {
    await startBooking({ bookingId: session.booking_id });
  } else {
    await completeBooking({ bookingId: session.booking_id });
  }

  const { data: updated, error: refetchError } = await supabase
    .from('grooming_sessions')
    .select(GROOMING_SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle();

  if (refetchError || !updated) {
    throwWithStatus(
      400,
      refetchError?.message ?? 'Failed to load the updated grooming session'
    );
  }

  return updated as GroomingSession;
}
