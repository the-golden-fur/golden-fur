import { BrevoClient, BrevoError } from '@getbrevo/brevo';

let cachedClient: BrevoClient | null = null;

/**
 * Lazily-constructed singleton over the Brevo SDK (@getbrevo/brevo) - mirrors
 * the pattern the old resend.client.ts used: process.env is read inside the
 * function, not at module-load time, so importing this module never crashes a
 * process whose .env isn't fully configured yet (e.g. a unit test that mocks
 * this module entirely and never actually calls sendEmail).
 *
 * maxRetries is pinned to 0: a transactional send that fails (including a 429
 * once the Brevo free-plan daily cap of 300 is hit) must surface immediately
 * to the best-effort caller, never be silently retried into the quota.
 */
function getClient(): BrevoClient {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured');
  }

  cachedClient = new BrevoClient({ apiKey, maxRetries: 0 });
  return cachedClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Golden Fur's transactional-email provider is Brevo (brevo.com) - the
 * successor to Resend (see the "Change Resend to Brevo" architectural change).
 * This is the one send path shared by every caller: account_created (+ resend),
 * booking confirmed/rescheduled/cancelled, payment confirmed, appointment
 * reminders, and the hotel care-log emails.
 *
 * BREVO_FROM_EMAIL is a "Display Name <address@domain.com>" header string
 * (matching the old RESEND_FROM_EMAIL convention); the address must be a
 * verified sender in Brevo (Settings -> Senders, Domains & Dedicated IPs).
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> {
  const fromHeader =
    process.env.BREVO_FROM_EMAIL ?? 'Golden Fur <noreply@goldenfur.com>';
  const match = fromHeader.match(/^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/);
  const senderName = match ? match[1] || undefined : undefined;
  const senderEmail = match ? match[2] : fromHeader.trim();

  try {
    await getClient().transactionalEmails.sendTransacEmail({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });
  } catch (error) {
    const message =
      error instanceof BrevoError
        ? `${error.message}`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    throw new Error(`Failed to send email via Brevo: ${message}`);
  }
}
