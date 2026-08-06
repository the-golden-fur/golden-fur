import { sendEmail } from './resend.client.ts';

export interface AppointmentReminderEmailParams {
  to: string;
  serviceCategory: string;
  branchName: string;
  scheduledDate: string;
  scheduledTime: string;
}

/**
 * Issue #97/#99: fired once per matching booking by the daily 8:00 AM CRON
 * (appointmentReminder.job.ts) - a genuinely new event, no scheduler
 * infrastructure existed anywhere in the app before Issue #99.
 */
export async function sendAppointmentReminderEmail({
  to,
  serviceCategory,
  branchName,
  scheduledDate,
  scheduledTime,
}: AppointmentReminderEmailParams): Promise<void> {
  const subject = 'Golden Fur - Appointment reminder';

  const html = `
    <p>This is a reminder of your upcoming ${serviceCategory} appointment at Golden Fur ${branchName}.</p>
    <p>
      <strong>Date:</strong> ${scheduledDate}<br />
      <strong>Time:</strong> ${scheduledTime}
    </p>
    <p>We look forward to seeing you and your pet!</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
