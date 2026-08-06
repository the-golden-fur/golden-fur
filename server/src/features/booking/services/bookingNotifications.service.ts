import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { sendBookingConfirmedEmail } from '../../../shared/email/bookingConfirmedEmail.ts';
import { sendBookingRescheduledEmail } from '../../../shared/email/bookingRescheduledEmail.ts';
import { sendBookingCancelledEmail } from '../../../shared/email/bookingCancelledEmail.ts';
import type { Booking } from '../booking.types.ts';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Issue #98: replaces the old sendBookingCreatedNotificationStub() console.info
 * call with a real dispatch, called from booking.service.ts's createBooking().
 * Fires on every successful creation (booking-status revision retired the
 * 'Confirmed' status value, but M11's booking_confirmed event still refers to
 * "a booking was successfully made", not that specific status name). Wrapped
 * so a failure here (a lookup or the notification write itself) never fails
 * booking creation - createNotification() already makes the email leg
 * non-blocking on its own.
 *
 * Kept in its own module (not inline in booking.service.ts) so the existing
 * unit/integration tests for booking.service.ts can mock this one function
 * wholesale, rather than needing to account for its extra Supabase lookups
 * in every test's sequential mock queue.
 */
export async function sendBookingConfirmedNotification(
  booking: Booking
): Promise<void> {
  try {
    const [{ data: customer }, { data: branch }] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('account_email, full_name')
        .eq('id', booking.customer_id)
        .maybeSingle(),
      supabase
        .from('branches')
        .select('name')
        .eq('id', booking.branch_id)
        .maybeSingle(),
    ]);

    let staffName: string | null = null;
    if (booking.assigned_staff_id) {
      const { data: staff } = await supabase
        .from('staff_profiles')
        .select('display_name')
        .eq('id', booking.assigned_staff_id)
        .maybeSingle();
      staffName = staff?.display_name ?? null;
    }

    const scheduledDate = formatDate(booking.scheduled_start);
    const scheduledTime = formatTime(booking.scheduled_start);

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'booking_confirmed',
      title: 'Booking confirmed',
      message:
        `Your ${booking.service_category} booking on ${scheduledDate} at ${scheduledTime} has been confirmed.` +
        (staffName ? ` Assigned staff: ${staffName}.` : ''),
      relatedBookingId: booking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendBookingConfirmedEmail({
              to: customer.account_email,
              serviceCategory: booking.service_category,
              branchName: branch?.name ?? '',
              scheduledDate,
              scheduledTime,
              staffName,
            })
        : undefined,
    });
  } catch (error) {
    console.error('Failed to send booking_confirmed notification:', error);
  }
}

/**
 * Issue #98: no stub existed for this event - net-new call, called from
 * reschedule.service.ts at the end of a successful rescheduleBooking(),
 * reading the booking row before (previousBooking) and after
 * (updatedBooking) the update so the message/email can report both the old
 * and new schedule.
 */
export async function sendBookingRescheduledNotification(
  previousBooking: Booking,
  updatedBooking: Booking
): Promise<void> {
  try {
    const { data: customer } = await supabase
      .from('customer_profiles')
      .select('account_email')
      .eq('id', updatedBooking.customer_id)
      .maybeSingle();

    const oldScheduledDate = formatDate(previousBooking.scheduled_start);
    const oldScheduledTime = formatTime(previousBooking.scheduled_start);
    const newScheduledDate = formatDate(updatedBooking.scheduled_start);
    const newScheduledTime = formatTime(updatedBooking.scheduled_start);

    await createNotification({
      recipientCustomerId: updatedBooking.customer_id,
      eventType: 'booking_rescheduled',
      title: 'Booking rescheduled',
      message: `Your ${updatedBooking.service_category} booking was moved from ${oldScheduledDate} ${oldScheduledTime} to ${newScheduledDate} ${newScheduledTime}.`,
      relatedBookingId: updatedBooking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendBookingRescheduledEmail({
              to: customer.account_email,
              serviceCategory: updatedBooking.service_category,
              oldScheduledDate,
              oldScheduledTime,
              newScheduledDate,
              newScheduledTime,
            })
        : undefined,
    });
  } catch (error) {
    console.error('Failed to send booking_rescheduled notification:', error);
  }
}

export interface SendBookingCancelledNotificationParams {
  booking: Booking;
  noticePeriodMet: boolean;
  policyViolation: boolean;
  /** The issued credit amount, or null when no credit was issued for this
   * cancellation (unmet notice, or no downpayment to convert). */
  creditAmount: number | null;
}

/**
 * Issue #98: no stub existed for this event either - net-new call, called
 * from cancellation.service.ts positioned immediately after Sprint 5 Epic
 * B's credit-issuance block (not before it), so the message can report
 * whether credit was issued and the amount.
 */
export async function sendBookingCancelledNotification({
  booking,
  noticePeriodMet,
  policyViolation,
  creditAmount,
}: SendBookingCancelledNotificationParams): Promise<void> {
  try {
    const { data: customer } = await supabase
      .from('customer_profiles')
      .select('account_email')
      .eq('id', booking.customer_id)
      .maybeSingle();

    const scheduledDate = formatDate(booking.scheduled_start);
    const scheduledTime = formatTime(booking.scheduled_start);

    const creditLine =
      creditAmount !== null
        ? ` A credit of ₱${creditAmount.toFixed(2)} has been issued to your account.`
        : '';

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'booking_cancelled',
      title: 'Booking cancelled',
      message: `Your ${booking.service_category} booking on ${scheduledDate} at ${scheduledTime} has been cancelled.${creditLine}`,
      relatedBookingId: booking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendBookingCancelledEmail({
              to: customer.account_email,
              serviceCategory: booking.service_category,
              scheduledDate,
              scheduledTime,
              noticePeriodMet,
              policyViolation,
            })
        : undefined,
    });
  } catch (error) {
    console.error('Failed to send booking_cancelled notification:', error);
  }
}
