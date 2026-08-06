import { sendEmail } from './resend.client.ts';

export interface PaymentConfirmedEmailParams {
  to: string;
  amount: number;
  paymentMethod: string;
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
}: PaymentConfirmedEmailParams): Promise<void> {
  const subject = 'Golden Fur - Payment confirmed';

  const html = `
    <p>We've received your payment of ₱${amount.toFixed(2)} via ${paymentMethod}.</p>
    <p>Thank you for choosing Golden Fur!</p>
  `.trim();

  await sendEmail({ to, subject, html });
}
