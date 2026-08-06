import { sendEmail } from './resend.client.ts';

export interface BookingCancelledEmailParams {
  to: string;
  serviceCategory: string;
  scheduledDate: string;
  scheduledTime: string;
  /** Whether the configured notice period was met (cancellation.service.ts's
   * evaluateNoticePeriod) - drives the outcome line below. Sprint 5 Epic B's
   * credit_balances/cancellation_logs tables (which would carry an actual
   * credit_issued/credit_amount figure) do not exist in this codebase yet -
   * see Issue #98's dev notes - so this reports the policy outcome that is
   * actually known rather than fabricating a credit amount nothing computes
   * yet. */
  noticePeriodMet: boolean;
  policyViolation: boolean;
}

/**
 * Issue #97/#98: fires when a cancellation completes. No stub existed for
 * this event before Issue #98 wired it.
 */
export async function sendBookingCancelledEmail({
  to,
  serviceCategory,
  scheduledDate,
  scheduledTime,
  noticePeriodMet,
  policyViolation,
}: BookingCancelledEmailParams): Promise<void> {
  const subject = 'Golden Fur - Booking cancelled';

  const outcomeLine = policyViolation
    ? "This cancellation did not meet the branch's required notice period."
    : noticePeriodMet
      ? 'This cancellation met the required notice period.'
      : 'Notice-period enforcement is currently disabled for this branch.';

  const html = `
    <p>Your ${serviceCategory} booking scheduled for ${scheduledDate} at ${scheduledTime} has been cancelled.</p>
    <p>${outcomeLine}</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
