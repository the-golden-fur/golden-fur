import { supabase } from '../../../config/supabase/supabase.config.ts';
import { FINISHED_BOOKING_STATUSES } from '../../booking/booking.types.ts';
import type { CurrentPrescription } from '../veterinary.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Issue #66: read-only, computed on demand - this pet's most recent
 * Completed consultation's medications array. Prior consultations are never
 * overwritten or archived; "current" simply means whichever consultation is
 * now most recent (#66 dev notes). Built as its own service, separate from
 * consultation.service.ts, since M05 (Sprint 4) will call it directly for
 * Hotel check-in auto-fill (Process 5, M07) and shouldn't need to import
 * anything else from this feature to do so.
 *
 * Booking-status revision: consultations.status/completed_at no longer
 * exist (M07 migration dropped them) - "did this consultation actually
 * happen" is now read off the joined booking's status/completed_at instead
 * (FINISHED_BOOKING_STATUSES = Completed or Paid). postgrest-js's
 * `referencedTable` order option doesn't reorder the top-level rows, so
 * this fetches every finished consultation for the pet and picks the most
 * recent by the joined booking's completed_at in JS, the same pattern
 * consultation.service.ts's own listConsultationQueue already uses for its
 * sort.
 */
export async function getCurrentPrescription(
  petId: string
): Promise<CurrentPrescription | null> {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, medications, booking:bookings!inner(status, completed_at)')
    .eq('pet_id', petId)
    .in('booking.status', FINISHED_BOOKING_STATUSES);

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    medications: CurrentPrescription['medications'];
    booking: { status: string; completed_at: string | null };
  }>;

  if (rows.length === 0) return null;

  const latest = rows.reduce((mostRecent, row) =>
    new Date(row.booking.completed_at ?? 0).getTime() >
    new Date(mostRecent.booking.completed_at ?? 0).getTime()
      ? row
      : mostRecent
  );

  return {
    consultation_id: latest.id,
    completed_at: latest.booking.completed_at ?? '',
    medications: latest.medications ?? [],
  };
}
