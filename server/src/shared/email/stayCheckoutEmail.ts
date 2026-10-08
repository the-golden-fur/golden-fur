import { sendEmail } from './brevo.client.ts';

export interface StayCheckoutEmailParams {
  to: string;
  petName: string;
  branchName: string;
  /** "hotel stay" or "daycare session". */
  stayLabel: string;
  /** The booked checkout time, already formatted in the branch's timezone. */
  checkoutTime: string;
  /** Only for a Daycare booking that isn't pay-at-checkout - the only stay
   * that runs up an hourly overdue fee. null leaves the fee out. */
  overdueFee: { feePerHour: number; graceMinutes: number } | null;
}

function overdueFeeParagraph(
  overdueFee: StayCheckoutEmailParams['overdueFee']
): string {
  if (!overdueFee) return '';

  return `
    <p>
      An overdue checkout fee of <strong>₱${overdueFee.feePerHour} per hour</strong> applies once pickup is more than ${overdueFee.graceMinutes} minutes late, and is added to your bill at checkout.
    </p>`;
}

/**
 * Custom change (checkout countdown notifications): sent once per stay by
 * stayCheckout.job.ts 15 minutes before a booked Hotel or Daycare pet's
 * checkout time.
 */
export async function sendCheckoutReminderEmail({
  to,
  petName,
  branchName,
  stayLabel,
  checkoutTime,
  overdueFee,
}: StayCheckoutEmailParams): Promise<void> {
  const subject = `Golden Fur - ${petName}'s checkout is in 15 minutes`;

  const html = `
    <p>${petName}'s ${stayLabel} at Golden Fur ${branchName} is booked until ${checkoutTime} - 15 minutes from now.</p>
    ${overdueFeeParagraph(overdueFee)}
    <p>Please be on your way to pick ${petName} up.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}

/**
 * Custom change (Daycare overdue checkout fee, now checkout countdown
 * notifications): sent once per stay by stayCheckout.job.ts when a booked
 * Hotel or Daycare pet's checkout countdown runs out and the pet is still
 * checked in.
 */
export async function sendCheckoutTimeReachedEmail({
  to,
  petName,
  branchName,
  stayLabel,
  checkoutTime,
  overdueFee,
}: StayCheckoutEmailParams): Promise<void> {
  const subject = `Golden Fur - ${petName}'s checkout time is up`;

  const html = `
    <p>${petName}'s ${stayLabel} at Golden Fur ${branchName} was booked until ${checkoutTime}, and ${petName} has not been picked up yet.</p>
    ${overdueFeeParagraph(overdueFee)}
    <p>Please pick ${petName} up as soon as you can.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
