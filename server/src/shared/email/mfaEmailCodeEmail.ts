import { sendEmail } from './brevo.client.ts';

export interface MfaEmailCodeEmailParams {
  to: string;
  code: string;
}

/**
 * Delivers the current code for a user's "email" MFA method - sent both when
 * confirming enrollment (the equivalent of "here's your QR code" for the
 * authenticator-app method) and at each login-time challenge, since a fresh
 * code must be emailed every time the user chooses this method. The code is
 * valid for the same ~30-second TOTP window Supabase enforces server-side, so
 * the copy nudges the user to use it quickly.
 */
export async function sendMfaEmailCodeEmail({
  to,
  code,
}: MfaEmailCodeEmailParams): Promise<void> {
  const html = `
    <p>Your Golden Fur verification code is:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
    <p>This code expires in about 30 seconds. If you didn't request this, you can ignore this email.</p>
  `.trim();

  await sendEmail({
    to,
    subject: 'Golden Fur - Your verification code',
    html,
  });
}
