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

/** Anchor time for a follow-up's placeholder slot - #67 dev notes: "does not
 * set a specific time slot", so any fixed anchor is fine; the receptionist's
 * confirmation step is what actually assigns a real slot. */
const PLACEHOLDER_HOUR_UTC = 9;

export interface ScheduleFollowUpResult {
  consultation: Consultation;
  booking: Booking;
}

interface ScheduleFollowUpParams {
  requesterId: string;
  consultationId: string;
  followUpDate: string;
}

/**
 * Issue #67: creates a Pending M03 booking from a completed or in-progress
 * consultation. Uses booking_status = 'Pending', the value Sprint 2 Epic B
 * reserved specifically for this - never a new status. Reviewer note: this
 * only creates the Pending booking (this issue's actual scope); the "normal
 * M03 confirmation flow" the Guide's AC-4 describes as promoting Pending ->
 * Confirmed is the Sprint 5 M08 cashier-confirmation flow that
 * booking.service.ts already stubs with its own `TODO(Sprint 5, M08)`
 * comment (line ~312) - that promotion path doesn't exist yet anywhere in
 * this codebase, staff or customer. What does exist and is verified here:
 * the booking is created Pending, visible in the Receptionist Bookings
 * Queue (#60 already reads off bookings.status with no change needed), and
 * reschedulable (reschedule.service.ts already allows Pending bookings) to
 * pick a real slot ahead of that future promotion.
 */
export async function scheduleFollowUp({
  requesterId,
  consultationId,
  followUpDate,
}: ScheduleFollowUpParams): Promise<ScheduleFollowUpResult> {
  const consultation = await getConsultation(consultationId);
  const bookingStatus = consultation.booking?.status;

  // Booking-status revision: consultation.status no longer exists - "has
  // this consultation started" is now read off the joined booking's status.
  // Per the booking-status revision brief, a follow-up now requires the
  // booking to have actually finished (Completed/Paid), not merely started
  // (In Progress) - tightened from the old Pending-only gate.
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

  const { data: originalBooking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', consultation.booking_id)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!originalBooking) throwWithStatus(404, 'Originating booking not found');

  const durationMs =
    new Date(originalBooking.scheduled_end).getTime() -
    new Date(originalBooking.scheduled_start).getTime();

  const scheduledStart = new Date(
    `${followUpDate}T${String(PLACEHOLDER_HOUR_UTC).padStart(2, '0')}:00:00.000Z`
  );
  const scheduledEnd = new Date(scheduledStart.getTime() + durationMs);

  const { data: newBooking, error: insertError } = await supabase
    .from('bookings')
    .insert({
      customer_id: originalBooking.customer_id,
      pet_id: originalBooking.pet_id,
      branch_id: originalBooking.branch_id,
      created_by_staff_id: requesterId,
      service_category: 'Veterinary',
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      status: 'Pending',
      total_price: originalBooking.total_price,
    })
    .select('*')
    .maybeSingle();

  if (insertError || !newBooking) {
    throwWithStatus(
      400,
      insertError?.message ?? 'Failed to create the follow-up booking'
    );
  }

  // Multi-item bookings revision: mirror the original consultation's booking
  // items onto the new follow-up booking (was a straight service_id/
  // package_id column copy before booking_items existed).
  const { data: originalItems, error: itemsFetchError } = await supabase
    .from('booking_items')
    .select('service_id, package_id, price_at_booking, duration_minutes_at_booking')
    .eq('booking_id', consultation.booking_id);

  if (itemsFetchError) throwWithStatus(400, itemsFetchError.message);

  if (originalItems && originalItems.length > 0) {
    const { error: itemsInsertError } = await supabase
      .from('booking_items')
      .insert(
        originalItems.map((item) => ({
          booking_id: newBooking.id,
          ...item,
        }))
      );

    if (itemsInsertError) {
      await supabase.from('bookings').delete().eq('id', newBooking.id);
      throwWithStatus(400, itemsInsertError.message);
    }
  }

  const { data: updatedConsultation, error: updateError } = await supabase
    .from('consultations')
    .update({
      follow_up_date: followUpDate,
      follow_up_booking_id: newBooking.id,
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
    booking: newBooking as Booking,
  };
}
