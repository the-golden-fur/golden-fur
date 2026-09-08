import { sendEmail } from './brevo.client.ts';

export interface CareLogDailyReportEmailParams {
  to: string;
  petName: string;
  branchName: string;
  reportDate: string;
  completed: string[];
  missed: string[];
  stillOpen: string[];
}

function section(title: string, items: string[]): string {
  if (items.length === 0) return '';
  const lis = items.map((item) => `<li>${item}</li>`).join('');
  return `<p><strong>${title}</strong></p><ul>${lis}</ul>`;
}

/**
 * The nightly care summary - ONE email per active hotel stay per day,
 * listing that day's care tasks bucketed by outcome. Sent by
 * careLogDailyReport.job.ts when
 * policy_configurations.care_log_daily_report_enabled is true (the default).
 * Replaces the old behaviour of one email per completed task, which drained
 * the Brevo 300/day quota on a busy hotel day.
 *
 * Reuses the 'care_log_completed' notification event for the customer's
 * email opt-out (no new notification_event_type enum value) - a customer who
 * turned off care updates gets neither the per-task email nor this summary.
 */
export async function sendCareLogDailyReportEmail({
  to,
  petName,
  branchName,
  reportDate,
  completed,
  missed,
  stillOpen,
}: CareLogDailyReportEmailParams): Promise<void> {
  const subject = `Golden Fur - ${petName}'s care summary for ${reportDate}`;

  const body =
    section('Completed', completed) +
    section('Missed', missed) +
    section('Still scheduled', stillOpen);

  const html = `
    <p>Here's how ${petName}'s day went at Golden Fur ${branchName} on ${reportDate}:</p>
    ${body || '<p>No care tasks were scheduled for this day.</p>'}
    <p>Thank you for trusting us with ${petName}'s care.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
