import { supabase } from '../../../config/supabase/supabase.config.ts';
import { listBookings } from '../../booking/services/booking.service.ts';
import type {
  BookingActivityRecord,
  BookingActivityReport,
} from '../reports.types.ts';

interface GetBookingActivityReportParams {
  requesterId: string;
  requesterRole: string;
  requesterBranchId: string;
  branchId?: string | null;
  dateFrom: string;
  dateTo: string;
}

/**
 * Custom change (Booking Activity Report): bookings/check-ins/check-outs/
 * no-shows/lates for a date range. Built on listBookings rather than a new
 * query - that function already applies the lazy Late/No-show transition
 * (applyLateAndNoShowTransition in booking.service.ts) and the downpayment-
 * expiry sweeps, so this report never shows a status that's gone stale since
 * the booking was last read. Branch-scoping mirrors getDailySalesReport:
 * only a Superadmin may pass a branchId or omit one for the combined-
 * branches view; Admin/Supervisor are locked to their own branch regardless
 * of what they pass.
 */
export async function getBookingActivityReport({
  requesterId,
  requesterRole,
  requesterBranchId,
  branchId,
  dateFrom,
  dateTo,
}: GetBookingActivityReportParams): Promise<BookingActivityReport> {
  const effectiveBranchId =
    requesterRole === 'Superadmin'
      ? (branchId ?? undefined)
      : requesterBranchId;

  const bookings = await listBookings({
    requesterId,
    filters: { branchId: effectiveBranchId, dateFrom, dateTo },
  });

  // Never a PostgREST FK embed for these two - same batched-lookup
  // convention as listTransactionHistory, since the service-role client
  // needs to resolve a pet/customer that's since been archived too.
  const petIds = [...new Set(bookings.map((booking) => booking.pet_id))];
  const customerIds = [
    ...new Set(bookings.map((booking) => booking.customer_id)),
  ];

  const petNameById = new Map<string, string>();
  if (petIds.length > 0) {
    const { data: pets } = await supabase
      .from('pets')
      .select('id, name')
      .in('id', petIds);

    for (const pet of pets ?? []) petNameById.set(pet.id, pet.name);
  }

  const customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer_profiles')
      .select('id, full_name')
      .in('id', customerIds);

    for (const customer of customers ?? [])
      customerNameById.set(customer.id, customer.full_name);
  }

  const records: BookingActivityRecord[] = bookings.map((booking) => ({
    id: booking.id,
    branch_id: booking.branch_id,
    customer_name: customerNameById.get(booking.customer_id) ?? null,
    pet_name: petNameById.get(booking.pet_id) ?? null,
    service_category: booking.service_category,
    scheduled_start: booking.scheduled_start,
    scheduled_end: booking.scheduled_end,
    status: booking.status,
    started_at: booking.started_at,
    completed_at: booking.completed_at,
  }));

  const totals = {
    total_bookings: records.length,
    pending: records.filter((record) => record.status === 'Pending').length,
    late: records.filter((record) => record.status === 'Late').length,
    checked_in: records.filter((record) => record.started_at !== null).length,
    checked_out: records.filter((record) => record.status === 'Completed')
      .length,
    no_show: records.filter((record) => record.status === 'No-show').length,
    cancelled: records.filter((record) => record.status === 'Cancelled').length,
  };

  return {
    branch_id: effectiveBranchId ?? null,
    date_from: dateFrom,
    date_to: dateTo,
    totals,
    records,
  };
}
