import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  FINISHED_BOOKING_STATUSES,
  type Booking,
} from '../../booking/booking.types.ts';
import { getConsultation } from './consultation.service.ts';
import type { Consultation } from '../veterinary.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface LinkFollowUpBookingResult {
  consultation: Consultation;
  booking: Booking;
}

interface LinkFollowUpBookingParams {
  consultationId: string;
  bookingId: string;
}

/**
 * Issue #67 (revised for the ScheduleFollowUpModal flow): the follow-up
 * booking is now created through the normal booking pipeline (POST
 * /bookings, same as a receptionist walk-in - see ScheduleFollowUpModal on
 * the client), which already runs pricing/capacity/staff checks and fires
 * the customer's booking_confirmed notification. This endpoint's only
 * remaining job is to link that already-created booking back onto the
 * originating consultation, after re-validating the same business rules the
 * old placeholder-creation version enforced (must be finished, only one
 * follow-up per consultation) plus a new ownership check (the linked booking
 * must actually be for the same pet).
 */
export async function linkFollowUpBooking({
  consultationId,
  bookingId,
}: LinkFollowUpBookingParams): Promise<LinkFollowUpBookingResult> {
  const consultation = await getConsultation(consultationId);
  const bookingStatus = consultation.booking?.status;

  if (!bookingStatus || !FINISHED_BOOKING_STATUSES.includes(bookingStatus)) {
    throwWithStatus(
      409,
      'A follow-up can only be scheduled once this consultation is finished'
    );
  }

  if (consultation.follow_up_booking_id) {
    throwWithStatus(
      409,
      'A follow-up has already been scheduled for this consultation'
    );
  }

  const { data: followUpBooking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!followUpBooking) throwWithStatus(404, 'Follow-up booking not found');

  if ((followUpBooking as Booking).pet_id !== consultation.pet_id) {
    throwWithStatus(
      400,
      'The follow-up booking must be for the same pet as this consultation'
    );
  }

  const followUpDate = (followUpBooking as Booking).scheduled_start.slice(
    0,
    10
  );

  const { data: updatedConsultation, error: updateError } = await supabase
    .from('consultations')
    .update({
      follow_up_date: followUpDate,
      follow_up_booking_id: bookingId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultationId)
    // Disambiguates against consultations.follow_up_booking_id, the second
    // FK to bookings - see consultation.service.ts's CONSULTATION_SELECT.
    .select('*, booking:bookings!booking_id(*)')
    .maybeSingle();

  if (updateError || !updatedConsultation) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to link the follow-up booking'
    );
  }

  return {
    consultation: updatedConsultation as Consultation,
    booking: followUpBooking as Booking,
  };
}
