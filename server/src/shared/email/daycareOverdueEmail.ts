import { sendEmail } from './brevo.client.ts';

export interface DaycareOverdueEmailParams {
  to: string;
  petName: string;
  branchName: string;
  scheduledEndTime: string;
  feePerHour: number;
  graceMinutes: number;
}

/**
 * Custom change (Daycare overdue checkout fee): fired once per stay by
 * daycareOverdue.job.ts when a booked Daycare pet is still checked in past
 * its booked end time.
 */
export async function sendDaycareOverdueEmail({
  to,
  petName,
  branchName,
  scheduledEndTime,
  feePerHour,
  graceMinutes,
}: DaycareOverdueEmailParams): Promise<void> {
  const subject = `Golden Fur - ${petName} is past daycare checkout time`;

  const html = `
    <p>${petName}'s daycare session at Golden Fur ${branchName} was booked until ${scheduledEndTime}, and ${petName} has not been picked up yet.</p>
    <p>
      An overdue checkout fee of <strong>₱${feePerHour} per hour</strong> applies once pickup is more than ${graceMinutes} minutes late, and is added to your bill at checkout.
    </p>
    <p>Please pick ${petName} up as soon as you can.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
