import { sendEmail } from './resend.client.ts';

export interface CareLogCompletedEmailParams {
  to: string;
  petName: string;
  description: string;
}

/**
 * Issue #97/#99: replaces careLogCompletion.service.ts's
 * fireCareLogCompletedEvent() stub - still gated by the caller on
 * hotel_stays.notify_opt_in (unchanged from today's behavior), this template
 * itself has no opt-in logic of its own.
 */
export async function sendCareLogCompletedEmail({
  to,
  petName,
  description,
}: CareLogCompletedEmailParams): Promise<void> {
  const subject = `Golden Fur - Care update for ${petName}`;

  const html = `
    <p>Your pet ${petName} just had a care activity completed at Golden Fur:</p>
    <p>${description}</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
