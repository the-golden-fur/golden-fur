import { sendEmail } from './brevo.client.ts';

export interface FollowUpScheduledEmailParams {
  to: string;
  petName: string;
  branchName: string;
  scheduledDate: string;
  scheduledTime: string;
  veterinarianName: string | null;
  reason: string;
}

/**
 * Custom change (follow-up booked by the vet): sent once the vet's Schedule
 * follow-up form has booked and linked a pet's free Follow-up Consultation -
 * see followUpNotifications.service.ts.
 */
export async function sendFollowUpScheduledEmail({
  to,
  petName,
  branchName,
  scheduledDate,
  scheduledTime,
  veterinarianName,
  reason,
}: FollowUpScheduledEmailParams): Promise<void> {
  const subject = `Golden Fur - ${petName}'s follow-up visit is booked`;
  const withVet = veterinarianName ? ` with ${veterinarianName}` : '';

  const html = `
    <p>${petName}'s veterinarian booked a follow-up visit${withVet} at Golden Fur ${branchName} on <strong>${scheduledDate} at ${scheduledTime}</strong>.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>The follow-up consultation itself is free. Anything done at the visit is billed afterwards.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
