import { sendEmail } from './resend.client.ts';

export interface AccountCreatedEmailParams {
  to: string;
  username: string;
  temporaryPassword: string;
  isResend?: boolean;
}

/**
 * The one account_created template, shared by the original send (staff
 * creation - staffManagement.service.ts) and the resend action
 * (resendAccountEmail.service.ts, Issue #74) - #74's dev notes are explicit
 * that resend "reuses the existing email template/service rather than
 * building a new one." isResend only changes the lead line, not the
 * credentials block, so AC-2's "matches the original account_created
 * template" holds for both call sites.
 */
export async function sendAccountCreatedEmail({
  to,
  username,
  temporaryPassword,
  isResend = false,
}: AccountCreatedEmailParams): Promise<void> {
  const subject = isResend
    ? 'Golden Fur - Your account credentials (resent)'
    : 'Welcome to Golden Fur - Your account has been created';

  const leadLine = isResend
    ? "Here's a resend of your Golden Fur staff account credentials."
    : 'A Golden Fur staff account has been created for you.';

  const html = `
    <p>${leadLine}</p>
    <p>
      <strong>Username:</strong> ${username}<br />
      <strong>Temporary password:</strong> ${temporaryPassword}
    </p>
    <p>Please log in and change your password as soon as possible.</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
