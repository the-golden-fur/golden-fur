import { sendEmail } from './brevo.client.ts';

export interface StayCheckedOutEmailParams {
  to: string;
  petName: string;
  branchName: string;
  /** "hotel stay" or "daycare session". */
  stayLabel: string;
  /** When staff checked the pet out, already formatted in the branch's
   * timezone. */
  checkedOutAt: string;
}

/**
 * Sent once when staff check a Hotel or Daycare pet out - the "your pet has
 * gone home" confirmation, after the checkout_reminder / checkout-time-is-up
 * emails that come before pickup (stayCheckoutEmail.ts).
 */
export async function sendStayCheckedOutEmail({
  to,
  petName,
  branchName,
  stayLabel,
  checkedOutAt,
}: StayCheckedOutEmailParams): Promise<void> {
  const subject = `Golden Fur - ${petName} has been checked out`;

  const html = `
    <p>${petName}'s ${stayLabel} at Golden Fur ${branchName} ended at ${checkedOutAt} - ${petName} has been checked out.</p>
    <p>Thank you for trusting us with ${petName}. We hope to see you both again soon.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
