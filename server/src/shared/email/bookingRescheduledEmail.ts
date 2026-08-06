import { sendEmail } from './resend.client.ts';

export interface BookingRescheduledEmailParams {
  to: string;
  serviceCategory: string;
  oldScheduledDate: string;
  oldScheduledTime: string;
  newScheduledDate: string;
  newScheduledTime: string;
}

/**
 * Issue #97/#98: fires when a reschedule completes successfully. Includes
 * both the old and new schedule details, per Modules-Features - no stub
 * existed for this event before Issue #98 wired it.
 */
export async function sendBookingRescheduledEmail({
  to,
  serviceCategory,
  oldScheduledDate,
  oldScheduledTime,
  newScheduledDate,
  newScheduledTime,
}: BookingRescheduledEmailParams): Promise<void> {
  const subject = 'Golden Fur - Booking rescheduled';

  const html = `
    <p>Your ${serviceCategory} booking at Golden Fur has been rescheduled.</p>
    <p>
      <strong>Previous:</strong> ${oldScheduledDate} at ${oldScheduledTime}<br />
      <strong>New:</strong> ${newScheduledDate} at ${newScheduledTime}
    </p>
    <p>See you at the new time!</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
