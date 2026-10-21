import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  completeBooking,
  startBooking,
} from '../../booking/services/booking.service.ts';
import type { Booking } from '../../booking/booking.types.ts';
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
 *
 * allDates is the explicit "no date limit at all": the client's "All
 * dates" preset has no bounds to send, which on its own is
 * indistinguishable from "nothing was asked for" and so used to fall into
 * the today default above - the filter said All dates and showed one day.
 */
function resolveDateRangeUtc(
  dateFrom?: string,
  dateTo?: string,
  allDates = false
): { dayStart: string; dayEnd: string } {
  if (!dateFrom && !dateTo) {
    return allDates
      ? {
          dayStart: '1970-01-01T00:00:00.000Z',
          dayEnd: '9999-12-31T00:00:00.000Z',
        }
      : todayRangeUtc();
  }

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
  /** True for the "All dates" filter - every date, past and upcoming,
   * instead of the today default. Ignored when a bound is given. */
  allDates?: boolean;
  /** 'queue' (default): what still needs grooming. 'history' ("Past
   * bookings" on the page): the finished ones - Completed, No-show and
   * Cancelled - same role scoping and date range, newest first. */
  view?: 'queue' | 'history';
}

/** Bookings that are over, one way or another - the "Past bookings" view. */
const PAST_BOOKING_STATUSES = ['Completed', 'No-show', 'Cancelled'];

interface RequesterScope {
  requesterId: string;
  requesterRole: string;
  requesterBranchId: string;
}

/** The bookings filter a requester is scoped by: own bookings for a
 * Groomer, own branch for Admin/Supervisor, none (every branch) for
 * Superadmin. Returned as eq() arguments rather than applied to a query -
 * a generic "apply to any builder" helper trips TypeScript's instantiation
 * depth limit on Supabase's builder types. */
function requesterBookingFilter({
  requesterId,
  requesterRole,
  requesterBranchId,
}: RequesterScope): ['assigned_staff_id' | 'branch_id', string] | null {
  if (requesterRole === 'Groomer') return ['assigned_staff_id', requesterId];
  if (requesterRole === 'Admin' || requesterRole === 'Supervisor') {
    return ['branch_id', requesterBranchId];
  }
  return null;
}

/** When the booking was over: completed_at, or for a No-show/Cancelled one
 * (never completed) its scheduled start. */
function finishedAtMs(session: GroomingSession): number {
  return new Date(
    session.booking?.completed_at ?? session.booking?.scheduled_start ?? 0
  ).getTime();
}

/** A groom that was started but not completed always comes first - the
 * longest-running one at the very top. */
function inProgressFirst(a: GroomingSession, b: GroomingSession): number {
  const aStarted = a.booking?.status === 'In Progress';
  const bStarted = b.booking?.status === 'In Progress';
  if (aStarted !== bStarted) return aStarted ? -1 : 1;
  if (!aStarted) return 0;
  return (
    new Date(a.booking?.started_at ?? 0).getTime() -
    new Date(b.booking?.started_at ?? 0).getTime()
  );
}

/**
 * "Past bookings": Completed, No-show and Cancelled grooming bookings in the
 * range, newest first. Unlike the queue this never vivifies a
 * grooming_sessions row - a booking cancelled before it ever reached the
 * queue shouldn't gain one just because someone looked at the past. One
 * without a session is returned in the same shape, keyed by its booking id;
 * the page shows no actions for a finished booking, so that id is never
 * sent back.
 */
async function listPastGroomingBookings(
  scope: RequesterScope,
  dayStart: string,
  dayEnd: string
): Promise<GroomingSession[]> {
  // "Past" means scheduled before now, whatever range was asked for - a
  // booking already cancelled for next week isn't a past booking yet. Both
  // are UTC ISO strings, so they compare in time order.
  const now = new Date().toISOString();
  const pastEnd = dayEnd < now ? dayEnd : now;

  let query = supabase
    .from('bookings')
    .select('*, booking_items(*)')
    .eq('service_category', 'Grooming')
    .in('status', PAST_BOOKING_STATUSES)
    .gte('scheduled_start', dayStart)
    .lt('scheduled_start', pastEnd);

  const filter = requesterBookingFilter(scope);
  if (filter) query = query.eq(...filter);

  const { data: bookings, error: bookingsError } = await query;

  if (bookingsError) throwWithStatus(400, bookingsError.message);

  const bookingRows = (bookings ?? []) as Booking[];
  if (bookingRows.length === 0) return [];

  const { data: sessions, error: sessionsError } = await supabase
    .from('grooming_sessions')
    .select('id, booking_id, assigned_groomer_id, queue_position, created_at, updated_at')
    .in(
      'booking_id',
      bookingRows.map((booking) => booking.id)
    );

  if (sessionsError) throwWithStatus(400, sessionsError.message);

  const sessionByBookingId = new Map(
    ((sessions ?? []) as Omit<GroomingSession, 'booking'>[]).map((session) => [
      session.booking_id,
      session,
    ])
  );

  return bookingRows
    .map(
      (booking): GroomingSession => ({
        ...(sessionByBookingId.get(booking.id) ?? {
          id: booking.id,
          booking_id: booking.id,
          assigned_groomer_id: booking.assigned_staff_id ?? '',
          queue_position: null,
          created_at: booking.created_at,
          updated_at: booking.created_at,
        }),
        booking,
      })
    )
    .sort((a, b) => finishedAtMs(b) - finishedAtMs(a));
}

/**
 * Grooming bookings in the given date range (today by default) that still
 * need grooming - 'In Progress', plus 'Pending' ones that have been paid
 * for - scoped by role (own sessions for a Groomer; own branch for
 * Admin/Supervisor; all branches for Superadmin).
 *
 * Paid Pending bookings are included so a groomer can see what's booked
 * with them before the customer arrives: for a time (walk-in booking flow
 * change) this queue was 'In Progress' only, which meant a paid online
 * booking for a specific groomer was invisible to that groomer until a
 * receptionist pressed Check In. An UNPAID Pending booking stays out - it
 * isn't a secured appointment yet (the same line startBooking draws when it
 * refuses to start one). Walk-in bookings (booking_source = 'Walk-in') are
 * created directly at 'In Progress' and appear here immediately, as before.
 *
 * A groom that was started but not completed ('In Progress') is always
 * listed, whatever the date range - one started yesterday and never
 * completed must not drop out of a "today" queue - and always sorts first.
 *
 * Auto-vivifies a grooming_sessions row for any matching booking that
 * doesn't have one yet - #64's Affected Files list only
 * grooming.service.ts/grooming.routes.ts, so booking.service.ts (Sprint 2
 * Epic B, already merged) is never touched; this lazy creation is what lets
 * the queue exist without a DB trigger or a change to booking creation.
 *
 * view 'history' is "Past bookings" instead - see listPastGroomingBookings.
 */
export async function listGroomingQueue({
  requesterId,
  requesterRole,
  requesterBranchId,
  dateFrom,
  dateTo,
  allDates,
  view = 'queue',
}: ListGroomingQueueParams): Promise<GroomingSession[]> {
  const { dayStart, dayEnd } = resolveDateRangeUtc(dateFrom, dateTo, allDates);
  const scope = { requesterId, requesterRole, requesterBranchId };

  if (view === 'history') {
    return listPastGroomingBookings(scope, dayStart, dayEnd);
  }

  // Custom change (P-1 roadmap item: generic downpayment): a booking whose
  // service/package requires a downpayment stays out of the queue (and
  // never gets a grooming_sessions row vivified below) until its
  // downpayment is paid - see 20260808111's dev notes.
  const filter = requesterBookingFilter(scope);
  const queueBookings = () => {
    const query = supabase
      .from('bookings')
      .select(
        'id, assigned_staff_id, branch_id, status, payment_status, awaiting_assessment'
      )
      .eq('service_category', 'Grooming')
      .or('downpayment_required.eq.false,payment_status.neq.Pending');
    return filter ? query.eq(...filter) : query;
  };

  // Two queries rather than one OR across status and date: everything in
  // the range, plus every started-but-not-completed groom on any date.
  const [inRangeResult, inProgressResult] = await Promise.all([
    queueBookings()
      .in('status', ['Pending', 'Late', 'In Progress'])
      .gte('scheduled_start', dayStart)
      .lt('scheduled_start', dayEnd),
    queueBookings().eq('status', 'In Progress'),
  ]);

  const bookingsError = inRangeResult.error ?? inProgressResult.error;
  if (bookingsError) throwWithStatus(400, bookingsError.message);

  // A booking in both results only once.
  const bookings = [
    ...new Map(
      [...(inRangeResult.data ?? []), ...(inProgressResult.data ?? [])].map(
        (row) => [row.id as string, row]
      )
    ).values(),
  ];

  const bookingRows = (
    bookings as Array<{
      id: string;
      assigned_staff_id: string;
      status: string;
      payment_status: string;
      awaiting_assessment?: boolean;
    }>
  )
    // A Pending booking only belongs here once something has been paid -
    // except one made before the pet was assessed (20261013264): it cannot
    // be paid until the pet arrives and is assessed, so hiding it would hide
    // the appointment from its groomer altogether. It is listed, flagged, and
    // still cannot be started (startBooking refuses it).
    .filter(
      (row) =>
        row.awaiting_assessment ||
        !(row.status === 'Pending' && row.payment_status === 'Pending')
    );

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

  // Started-but-not-completed first; then queue order: queue_position when
  // set, otherwise the booking's scheduled_start (chronological) - per
  // Modules-Features and the M04 Process 1 flow diagram.
  return rows.sort((a, b) => {
    const pinned = inProgressFirst(a, b);
    if (pinned !== 0) return pinned;

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
