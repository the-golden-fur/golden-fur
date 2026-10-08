import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendFollowUpScheduledEmail } from '../../../shared/email/followUpScheduledEmail.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { Booking } from '../../booking/booking.types.ts';

const DEFAULT_TIMEZONE = 'Asia/Manila';

/**
 * Custom change (follow-up booked by the vet): tells the pet's owner that
 * the vet booked a follow-up visit, when, with whom, and why.
 *
 * Needed because createBooking only sends "Booking confirmed" for an Online
 * booking once a payment settles, and a follow-up is the free Follow-up
 * Consultation - nothing is ever paid, so without this the owner would never
 * hear about it. Reuses the 'booking_confirmed' event type (same as
 * createBooking's free-package notice) so the owner's existing preference
 * for booking alerts applies.
 *
 * Best-effort: a failure is logged and never undoes the follow-up.
 */
export async function sendFollowUpScheduledNotification({
  booking,
  veterinarianId,
  reason,
}: {
  booking: Pick<
    Booking,
    'id' | 'customer_id' | 'pet_id' | 'branch_id' | 'scheduled_start'
  >;
  veterinarianId: string;
  reason: string;
}): Promise<void> {
  try {
    const [{ data: customer }, { data: branch }, { data: pet }, { data: vet }] =
      await Promise.all([
        supabase
          .from('customer_profiles')
          .select('account_email')
          .eq('id', booking.customer_id)
          .maybeSingle(),
        supabase
          .from('branches')
          .select('name, timezone')
          .eq('id', booking.branch_id)
          .maybeSingle(),
        supabase
          .from('pets')
          .select('name')
          .eq('id', booking.pet_id)
          .maybeSingle(),
        supabase
          .from('staff_profiles')
          .select('display_name')
          .eq('id', veterinarianId)
          .maybeSingle(),
      ]);

    const timeZone = branch?.timezone ?? DEFAULT_TIMEZONE;
    const start = new Date(booking.scheduled_start);
    const scheduledDate = new Intl.DateTimeFormat('en-PH', {
      timeZone,
      dateStyle: 'medium',
    }).format(start);
    const scheduledTime = new Intl.DateTimeFormat('en-PH', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(start);

    const petName = pet?.name ?? 'your pet';
    const veterinarianName = vet?.display_name ?? null;
    const branchName = branch?.name ?? '';

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'booking_confirmed',
      title: 'Follow-up visit booked',
      message:
        `Your vet booked a follow-up visit for ${petName} on ${scheduledDate} at ${scheduledTime}` +
        (veterinarianName ? ` with ${veterinarianName}` : '') +
        (branchName ? ` at ${branchName}` : '') +
        `. Reason: ${reason}`,
      relatedBookingId: booking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendFollowUpScheduledEmail({
              to: customer.account_email,
              petName,
              branchName,
              scheduledDate,
              scheduledTime,
              veterinarianName,
              reason,
            })
        : undefined,
    });
  } catch (error) {
    console.error(
      `Failed to send follow-up notification for booking ${booking.id}:`,
      error
    );
  }
}
