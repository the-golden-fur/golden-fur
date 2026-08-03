import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { BookingStatus } from '../../booking/booking.types.ts';
import type { HotelStay } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface HotelStayWithCage extends HotelStay {
  cage_label: string;
}

/** A hotel_stays row only ever exists once its booking has been physically
 * checked in, so the only statuses meaningful to filter by here are the
 * ones a Hotel booking passes through from that point on (booking-status
 * revision - hotel_stays itself no longer carries a status column). */
export type HotelStayFilterStatus = Extract<
  BookingStatus,
  'In Progress' | 'Completed'
>;

interface ListHotelStaysParams {
  branchId: string;
  /** Omitted returns every stay regardless of its booking's status - used by
   * HotelBookingPicker to flag any booking that already has a stay (In
   * Progress or Completed), not just ones still checked in. */
  status?: HotelStayFilterStatus;
}

/**
 * Backs two client needs at once: HotelBookingPicker cross-referencing
 * which bookings already have a stay (so it can stop offering a second
 * check-in), and HotelStayPicker's checkout search/filter/sort list
 * (replacing a raw "paste the stay id" field). The stay's own execution
 * state is now read off its joined booking's status (booking-status
 * revision), not a separate hotel_stays.status column.
 */
export async function listHotelStays({
  branchId,
  status,
}: ListHotelStaysParams): Promise<HotelStayWithCage[]> {
  let query = supabase
    .from('hotel_stays')
    .select('*, cages!inner(branch_id, cage_label), bookings!inner(status)')
    .eq('cages.branch_id', branchId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('bookings.status', status);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (
    (data ?? []) as unknown as Array<
      HotelStay & { cages: { cage_label: string } }
    >
  ).map((row) => ({ ...row, cage_label: row.cages.cage_label }));
}
