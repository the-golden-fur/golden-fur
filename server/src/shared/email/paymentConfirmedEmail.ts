import { sendEmail } from './brevo.client.ts';

export interface PaymentConfirmedEmailParams {
  to: string;
  amount: number;
  paymentMethod: string;
  /** One extra line on what is still owed ("Remaining balance: ..." /
   * "...now fully paid."), when the sender knows it. */
  balanceNote?: string | null;
}

/**
 * Issue #97/#99: fires when a transaction reaches the confirmed trigger
 * condition, regardless of payment channel (Modules-Features) - net-new
 * call site, no stub existed for this event before Issue #99 wired it.
 */
export async function sendPaymentConfirmedEmail({
  to,
  amount,
  paymentMethod,
  balanceNote,
}: PaymentConfirmedEmailParams): Promise<void> {
  const subject = 'Golden Fur - Payment confirmed';

  const html = `
    <p>We've received your payment of ₱${amount.toFixed(2)} via ${paymentMethod}.</p>
    ${balanceNote ? `<p>${balanceNote}</p>` : ''}
    <p>Thank you for choosing Golden Fur!</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
