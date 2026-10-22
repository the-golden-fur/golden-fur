import { sendEmail } from './brevo.client.ts';

export interface NotificationEmailParams {
  to: string;
  /** The in-app notification's title - becomes the subject line. */
  title: string;
  /** The in-app notification's message - becomes the body. */
  message: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The email twin of an in-app notification whose event has no dedicated
 * template - the subject and body are the notification's own title and
 * message, so the email never says something different from the bell.
 * Used for staff_assigned, booking_slot_conflict, vaccination_reviewed and
 * the booking_confirmed follow-ups (free package unlocked, final price after
 * assessment, cage-size alerts). The message can carry free text (a customer
 * name, a rejection reason), so it is HTML-escaped.
 */
export async function sendNotificationEmail({
  to,
  title,
  message,
}: NotificationEmailParams): Promise<void> {
  const html = `<p>${escapeHtml(message)}</p>`;

  await sendEmail({ to, subject: `Golden Fur - ${title}`, html });
}
