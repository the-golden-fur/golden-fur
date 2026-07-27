import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { HotelStay, HotelStayStatus } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface HotelStayWithCage extends HotelStay {
  cage_label: string;
}

interface ListHotelStaysParams {
  branchId: string;
  /** Omitted returns every status - used by HotelBookingPicker to flag any
   * booking that already has a stay (Active or Completed), not just ones
   * still in progress. */
  status?: HotelStayStatus;
}

/**
 * Backs two client needs at once: HotelBookingPicker cross-referencing
 * which Confirmed bookings already have a stay (so it can stop offering a
 * second check-in - a real gap surfaced by manual testing: booking.status
 * never changes at check-in, only hotel_stays does, so the booking picker
 * had no way to know), and HotelStayPicker's checkout search/filter/sort
 * list (replacing a raw "paste the stay id" field).
 */
export async function listHotelStays({
  branchId,
  status,
}: ListHotelStaysParams): Promise<HotelStayWithCage[]> {
  let query = supabase
    .from('hotel_stays')
    .select('*, cages!inner(branch_id, cage_label)')
    .eq('cages.branch_id', branchId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (
    (data ?? []) as unknown as Array<
      HotelStay & { cages: { cage_label: string } }
    >
  ).map((row) => ({ ...row, cage_label: row.cages.cage_label }));
}
