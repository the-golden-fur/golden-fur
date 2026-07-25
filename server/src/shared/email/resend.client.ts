import { Resend } from 'resend';

let cachedClient: Resend | null = null;

/**
 * Lazily-constructed singleton over the Resend SDK - mirrors
 * supabaseAuth.api.ts's pattern of reading process.env inside the function,
 * not at module-load time, so importing this module never crashes a process
 * whose .env isn't fully configured yet (e.g. a unit test that mocks this
 * module entirely and never actually calls sendEmail).
 */
function getClient(): Resend {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Issue #74: Golden Fur's actual transactional-email provider is Resend
 * (resend.com) - previous drafts of this feature assumed a generic "email
 * service" already existed from Sprint 1; it didn't (temp passwords were
 * only ever returned once in the create-account API response - see the old
 * generateTemporaryPassword() comment in staffManagement.service.ts). This
 * is the first real send path in the codebase; both the original
 * account_created send (on staff creation) and the new resend action
 * (resendAccountEmail.service.ts) go through this one function.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> {
  const from =
    process.env.RESEND_FROM_EMAIL ?? 'Golden Fur <onboarding@resend.dev>';

  const { error } = await getClient().emails.send({ from, to, subject, html });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}
