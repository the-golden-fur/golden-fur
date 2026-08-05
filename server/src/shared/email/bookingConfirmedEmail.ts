import { sendEmail } from './resend.client.ts';

export interface BookingConfirmedEmailParams {
  to: string;
  serviceCategory: string;
  branchName: string;
  scheduledDate: string;
  scheduledTime: string;
  staffName?: string | null;
}

/**
 * Issue #97/#98: fires on every successful booking creation. Includes
 * service type, branch, date, time, and assigned staff name per
 * Modules-Features - staffName is omitted from the body for
 * Hotel/Daycare/Misc bookings, which have no assigned_staff_id.
 */
export async function sendBookingConfirmedEmail({
  to,
  serviceCategory,
  branchName,
  scheduledDate,
  scheduledTime,
  staffName,
}: BookingConfirmedEmailParams): Promise<void> {
  const subject = 'Golden Fur - Booking confirmed';

  const html = `
    <p>Your ${serviceCategory} booking at Golden Fur ${branchName} has been confirmed.</p>
    <p>
      <strong>Date:</strong> ${scheduledDate}<br />
      <strong>Time:</strong> ${scheduledTime}<br />
      ${staffName ? `<strong>Assigned staff:</strong> ${staffName}<br />` : ''}
    </p>
    <p>See you then!</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
