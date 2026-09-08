import { sendEmail } from './brevo.client.ts';

export interface BookingGroupConfirmedEmailLine {
  petName: string | null;
  serviceCategory: string;
  scheduledDate: string;
  scheduledTime: string;
  staffName?: string | null;
}

export interface BookingGroupConfirmedEmailParams {
  to: string;
  branchName: string;
  bookings: BookingGroupConfirmedEmailLine[];
}

/**
 * Multi-booking checkout confirmation - ONE email covering every booking in
 * the cart, sent when policy_configurations.booking_group_email_mode is
 * 'combined' (the default). 'per_booking' mode falls back to one
 * bookingConfirmedEmail per booking instead. In-app notification rows are
 * always one per booking regardless of mode.
 *
 * Added with the Resend -> Brevo migration to stop a single N-pet checkout
 * spending N of the 300/day quota on near-identical confirmation emails.
 */
export async function sendBookingGroupConfirmedEmail({
  to,
  branchName,
  bookings,
}: BookingGroupConfirmedEmailParams): Promise<void> {
  const subject =
    bookings.length === 1
      ? 'Golden Fur - Booking confirmed'
      : `Golden Fur - ${bookings.length} bookings confirmed`;

  const rows = bookings
    .map((line) => {
      const who = line.petName ? `${line.petName} - ` : '';
      const staff = line.staffName
        ? `<br />&nbsp;&nbsp;<strong>Assigned staff:</strong> ${line.staffName}`
        : '';
      return `<li>${who}${line.serviceCategory} on ${line.scheduledDate} at ${line.scheduledTime}${staff}</li>`;
    })
    .join('');

  const html = `
    <p>Your ${
      bookings.length === 1 ? 'booking has' : `${bookings.length} bookings have`
    } been confirmed at Golden Fur ${branchName}.</p>
    <ul>${rows}</ul>
    <p>See you then!</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
