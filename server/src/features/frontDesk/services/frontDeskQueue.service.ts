import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Booking } from '../../booking/booking.types.ts';
import {
  completeBooking,
  listBookings,
  startBooking,
} from '../../booking/services/booking.service.ts';
import type { ServicesDoneLine } from '../../veterinary/modules/validators/veterinary.validator.ts';
import {
  getOrCreateConsultationIdForBooking,
  updateConsultation,
} from '../../veterinary/services/consultation.service.ts';
import type { FrontDeskQueueRow } from '../frontDesk.types.ts';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's bookings plus anything still In Progress from an earlier day (a
 * Hotel stay runs for days, and a forgotten groom must not fall off the
 * list). Goes through listBookings so its lazy Late/No-show transitions
 * apply; "today" is the Manila day, which listBookings' UTC date filters
 * can't express on their own, so the extra UTC day is trimmed here. */
async function loadQueueBookings(
  requesterId: string,
  branchId: string | null,
  now: number
): Promise<Booking[]> {
  const manilaToday = utcDate(now + MANILA_OFFSET_MS);
  const dayStart = new Date(`${manilaToday}T00:00:00+08:00`).getTime();
  const dayEnd = dayStart + DAY_MS;
  const filters = branchId ? { branchId } : {};

  const [todays, inProgress] = await Promise.all([
    listBookings({
      requesterId,
      filters: {
        ...filters,
        dateFrom: utcDate(dayStart),
        dateTo: utcDate(dayEnd),
      },
    }),
    listBookings({
      requesterId,
      filters: { ...filters, status: 'In Progress' },
    }),
  ]);

  const byId = new Map<string, Booking>();

  for (const booking of todays) {
    const start = new Date(booking.scheduled_start).getTime();
    if (start >= dayStart && start < dayEnd) byId.set(booking.id, booking);
  }
  for (const booking of inProgress) byId.set(booking.id, booking);

  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() -
      new Date(b.scheduled_start).getTime()
  );
}

async function loadNames(
  table: 'pets' | 'customer_profiles' | 'staff_profiles',
  column: 'name' | 'full_name' | 'display_name',
  ids: Array<string | null>
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from(table)
    .select(`id, ${column}`)
    .in('id', uniqueIds);

  if (error) throwWithStatus(400, error.message);

  return new Map(
    ((data ?? []) as unknown as Array<Record<string, string>>).map((row) => [
      row.id,
      row[column],
    ])
  );
}

export async function listFrontDeskQueue({
  requesterId,
  branchId,
}: {
  requesterId: string;
  /** null means every branch - Superadmin only, resolved by the controller. */
  branchId: string | null;
}): Promise<FrontDeskQueueRow[]> {
  const now = Date.now();
  const bookings = await loadQueueBookings(requesterId, branchId, now);
  if (bookings.length === 0) return [];

  const [petNames, ownerNames, staffNames, staysResult] = await Promise.all([
    loadNames(
      'pets',
      'name',
      bookings.map((booking) => booking.pet_id)
    ),
    loadNames(
      'customer_profiles',
      'full_name',
      bookings.map((booking) => booking.customer_id)
    ),
    loadNames(
      'staff_profiles',
      'display_name',
      bookings.flatMap((booking) => [
        booking.assigned_staff_id,
        booking.completed_by_staff_id,
      ])
    ),
    supabase
      .from('stays')
      .select('id, booking_id, status')
      .in(
        'booking_id',
        bookings.map((booking) => booking.id)
      ),
  ]);

  if (staysResult.error) throwWithStatus(400, staysResult.error.message);

  const stays = (staysResult.data ?? []) as Array<{
    id: string;
    booking_id: string;
    status: string;
  }>;
  const stayByBooking = new Map(stays.map((stay) => [stay.booking_id, stay]));
  const openStayIds = stays
    .filter((stay) => stay.status !== 'Completed')
    .map((stay) => stay.id);

  const taskCounts = new Map<string, number>();

  if (openStayIds.length > 0) {
    const { data, error } = await supabase
      .from('care_log_entries')
      .select('stay_id')
      .in('stay_id', openStayIds)
      .in('status', ['Pending', 'In Progress'])
      .lte('scheduled_date', utcDate(now));

    if (error) throwWithStatus(400, error.message);

    for (const { stay_id: stayId } of (data ?? []) as Array<{
      stay_id: string;
    }>) {
      taskCounts.set(stayId, (taskCounts.get(stayId) ?? 0) + 1);
    }
  }

  return bookings.map((booking) => {
    const stay = stayByBooking.get(booking.id);

    return {
      booking,
      pet_name: petNames.get(booking.pet_id) ?? null,
      owner_name: ownerNames.get(booking.customer_id) ?? null,
      assigned_staff_name: booking.assigned_staff_id
        ? (staffNames.get(booking.assigned_staff_id) ?? null)
        : null,
      completed_by_name: booking.completed_by_staff_id
        ? (staffNames.get(booking.completed_by_staff_id) ?? null)
        : null,
      stay_id: stay?.id ?? null,
      outstanding_task_count: stay ? (taskCounts.get(stay.id) ?? 0) : 0,
    };
  });
}

interface AdvanceParams {
  bookingId: string;
  requesterId: string;
  /** null means any branch - Superadmin only. */
  branchId: string | null;
}

/** Only services with no check-in/out of their own can advance here. The
 * generic start/complete would leave a Hotel/Daycare stay open and its cage
 * Occupied, so those must go through check-in and check-out instead. */
async function loadAdvanceableBooking({
  bookingId,
  branchId,
}: AdvanceParams): Promise<'Grooming' | 'Veterinary'> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('branch_id, service_category')
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!booking) throwWithStatus(404, 'Booking not found');

  if (branchId && booking.branch_id !== branchId) {
    throwWithStatus(403, 'Booking does not belong to your branch');
  }

  const category = booking.service_category as string;

  if (category !== 'Grooming' && category !== 'Veterinary') {
    throwWithStatus(
      409,
      `A ${category} booking is started by check-in and completed by check-out`
    );
  }

  return category;
}

export async function startFrontDeskBooking(
  params: AdvanceParams
): Promise<void> {
  const { bookingId, requesterId } = params;
  const category = await loadAdvanceableBooking(params);

  if (category === 'Grooming') {
    await startBooking({ bookingId, staffId: requesterId });
    return;
  }

  await updateConsultation({
    requesterId,
    consultationId: await getOrCreateConsultationIdForBooking(bookingId),
    input: { status: 'Ongoing' },
    onBehalfOfVet: true,
  });
}

export async function completeFrontDeskBooking({
  servicesDone,
  ...params
}: AdvanceParams & { servicesDone: ServicesDoneLine[] }): Promise<void> {
  const { bookingId, requesterId } = params;
  const category = await loadAdvanceableBooking(params);

  if (category === 'Grooming') {
    await completeBooking({ bookingId, staffId: requesterId });
    return;
  }

  await updateConsultation({
    requesterId,
    consultationId: await getOrCreateConsultationIdForBooking(bookingId),
    input: { status: 'Completed', services_done: servicesDone },
    onBehalfOfVet: true,
  });
}
