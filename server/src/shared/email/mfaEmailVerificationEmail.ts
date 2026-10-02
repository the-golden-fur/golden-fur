import { sendEmail } from './brevo.client.ts';

export interface MfaEmailVerificationEmailParams {
  to: string;
  code: string;
}

/**
 * One-time proof-of-ownership code for an Admin-tier account's bound MFA
 * email (see mfa_email_verifications' migration comment) - distinct from
 * mfaEmailCodeEmail.ts's recurring login codes, which only exist once this
 * verification has already passed. Valid for 15 minutes since, unlike a
 * login code, the user isn't necessarily entering it back immediately.
 */
export async function sendMfaEmailVerificationEmail({
  to,
  code,
}: MfaEmailVerificationEmailParams): Promise<void> {
  const html = `
    <p>Confirm this is your email address for Golden Fur two-factor login by entering this code:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
    <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
  `.trim();

  await sendEmail({
    to,
    subject: 'Golden Fur - Confirm your email for two-factor login',
    html,
  });
}
