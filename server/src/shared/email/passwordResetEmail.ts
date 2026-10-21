import { sendEmail } from './brevo.client.ts';

export interface PasswordResetEmailParams {
  to: string;
  resetLink: string;
}

/**
 * Sends a password-reset link via Brevo. Called by both the customer and the
 * staff forgot-password controllers, which use the Supabase admin API to
 * generate a short-lived (1 h) magic-link token and pass it here.
 *
 * We use a custom Brevo send instead of Supabase's own built-in
 * "reset password for email" so that the email is styled consistently with
 * the rest of Golden Fur's transactional mail, sent from the same verified
 * sender address, and counted against the same Brevo quota rather than the
 * hosted-project's 2-email-per-hour rate limit.
 */
export async function sendPasswordResetEmail({
  to,
  resetLink,
}: PasswordResetEmailParams): Promise<void> {
  const html = `
    <p>We received a request to reset the password for your Golden Fur account.</p>
    <p>Click the link below to choose a new password. This link expires in 1 hour.</p>
    <p>
      <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#d97706;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">
        Reset my password
      </a>
    </p>
    <p style="font-size:13px;color:#6b7280;">
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
  `.trim();

  await sendEmail({
    to,
    subject: 'Golden Fur - Reset your password',
    html,
  });
}
